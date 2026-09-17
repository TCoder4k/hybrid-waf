import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithRawBody } from '../../common/raw-body-capture.middleware';
import { UpstreamConfigService } from '../../common/upstream-config.service';

// Headers that must not be forwarded verbatim between hops (either
// connection-specific, or recomputed by fetch/the HTTP stack itself).
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const JSON_CONTENT_TYPE = /^application\/json\b/i;
const URLENCODED_CONTENT_TYPE = /^application\/x-www-form-urlencoded\b/i;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

// Phase P2, docs/architecture.md §22: how long to wait for the upstream
// before giving up. Distinct from a connection failure (502) — this is
// "connected but never finished responding," which gets its own 504. Read
// fresh per call, same reasoning as resolveUpstreamUrl() — swappable
// without a restart, and testable without module-reload gymnastics.
function resolveUpstreamTimeoutMs(): number {
  const parsed = Number(process.env.UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_UPSTREAM_TIMEOUT_MS;
}

export interface ForwardedResponse {
  status: number;
  headers: Record<string, string>;
  // Buffer for a real upstream response body (binary-safe — Phase P2
  // replaced the old .text()-only relay, which mangled non-text responses
  // like images). String only for the WAF's own generated JSON error
  // bodies (502/504) below.
  body: string | Buffer;
}

function gatewayError(
  status: number,
  error: string,
  message: string,
): ForwardedResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statusCode: status, error, message }),
  };
}

// Sole responsibility: relay the raw request to the configured upstream and
// relay its response back verbatim. No normalization, detection, or
// decision logic — this is the "Forward to Upstream" step at the bottom of
// the pipeline in docs/architecture.md §3.1/§21/§22, called by WafService
// once ALLOW is decided.
//
// Generalized in Phase P1 (ADR-8, §21) from the original
// ProtectedApiClientService, which only ever forwarded to the bundled
// `protected-api` demo service. Hardened for transparency in Phase P2
// (§22): upstream timeout, real 3xx relay (not silently followed), a
// content-type-aware body (JSON/urlencoded re-serialized from the already
// parsed req.body, everything else forwarded byte-for-byte from
// req.rawBody — see raw-body-capture.middleware.ts), binary-safe response
// relay, and X-Forwarded-* headers so the upstream can see the real client.
//
// Hard invariant, unchanged since P1: the target is ALWAYS server-side env
// configuration (resolveUpstreamUrl()), never derived from req.headers,
// req.body, req.query, or any other client-controlled input — this is what
// keeps a configurable upstream from becoming an SSRF/open-proxy vector.
@Injectable()
export class UpstreamProxyService {
  constructor(private readonly upstreamConfigService: UpstreamConfigService) {}

  async forward(req: Request): Promise<ForwardedResponse> {
    let upstreamUrl: string;
    try {
      upstreamUrl = await this.upstreamConfigService.getActiveUrl();
    } catch {
      // Malformed UPSTREAM_URL/PROTECTED_API_URL — main.ts already validates
      // this at boot (fails fast), so reaching this in practice would mean
      // the env changed after startup. Degrade the same way an unreachable
      // upstream does (502) rather than letting a config error crash the
      // request handler.
      return gatewayError(
        502,
        'Bad Gateway',
        'Upstream is not configured correctly',
      );
    }

    const targetUrl = `${upstreamUrl}${req.originalUrl}`;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        typeof value === 'string' &&
        !HOP_BY_HOP_HEADERS.has(key.toLowerCase())
      ) {
        headers[key] = value;
      }
    }
    applyForwardedHeaders(headers, req);

    const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      upstreamTimeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: buildOutboundBody(req),
        // Relay the upstream's real 3xx to the client instead of silently
        // following it ourselves — the client asked the upstream (via us),
        // not us, where to go next.
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return gatewayError(
          504,
          'Gateway Timeout',
          `Upstream did not respond within ${upstreamTimeoutMs}ms`,
        );
      }
      // Upstream unreachable — see docs/architecture.md §16 Failure Handling.
      return gatewayError(502, 'Bad Gateway', 'Upstream is unavailable');
    } finally {
      clearTimeout(timeoutHandle);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    const body = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: responseHeaders, body };
  }
}

// Content-type-aware body building (Phase P2). Nest's default parsers
// (main.ts) already gave us a structured req.body for JSON/urlencoded — we
// re-serialize FROM that rather than from raw bytes, matching what
// RequestNormalizerService/detection already saw. Everything else (
// multipart/form-data, images, arbitrary binary, no body at all) comes from
// req.rawBody, captured verbatim by raw-body-capture.middleware.ts — never
// re-parsed or reinterpreted, just relayed byte-for-byte.
function buildOutboundBody(req: RequestWithRawBody): BodyInit | undefined {
  const contentType = req.headers['content-type'] ?? '';

  if (JSON_CONTENT_TYPE.test(contentType)) {
    return hasParsedBody(req.body) ? JSON.stringify(req.body) : undefined;
  }

  if (URLENCODED_CONTENT_TYPE.test(contentType)) {
    return hasParsedBody(req.body)
      ? new URLSearchParams(req.body as Record<string, string>).toString()
      : undefined;
  }

  const raw = req.rawBody;
  return raw && raw.length > 0 ? new Uint8Array(raw) : undefined;
}

function hasParsedBody(body: unknown): boolean {
  return body !== undefined && body !== null && Object.keys(body).length > 0;
}

// Lets the upstream see who the real client was, without affecting WHERE we
// connect (that's exclusively resolveUpstreamUrl() — this never touches
// targetUrl). req.ip is the same trust-proxy-resolved value already used
// for NormalizedRequest.sourceIp/SecurityEvent.sourceIp — reused here
// rather than introducing a second notion of "the client's IP." Appends to
// any pre-existing X-Forwarded-For chain rather than overwriting it, the
// standard reverse-proxy convention.
function applyForwardedHeaders(
  headers: Record<string, string>,
  req: Request,
): void {
  const clientIp = req.ip ?? '';
  const inboundXff = req.headers['x-forwarded-for'];
  headers['x-forwarded-for'] =
    typeof inboundXff === 'string' && inboundXff.length > 0
      ? `${inboundXff}, ${clientIp}`
      : clientIp;

  headers['x-forwarded-proto'] = req.protocol;

  const inboundHost = req.headers['x-forwarded-host'] ?? req.headers.host;
  if (typeof inboundHost === 'string') {
    headers['x-forwarded-host'] = inboundHost;
  }
}
