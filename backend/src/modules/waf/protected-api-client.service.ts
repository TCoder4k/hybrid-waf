import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

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

export interface ForwardedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// Sole responsibility: relay the raw request to Protected API and relay its
// response back verbatim. No normalization, detection, or decision logic —
// this is the "Forward to Protected API" step at the bottom of the pipeline
// in docs/architecture.md §3.1, called by WafService once ALLOW is decided.
@Injectable()
export class ProtectedApiClientService {
  async forward(req: Request): Promise<ForwardedResponse> {
    const protectedApiUrl =
      process.env.PROTECTED_API_URL ?? 'http://localhost:3001';
    const targetUrl = `${protectedApiUrl}${req.originalUrl}`;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        typeof value === 'string' &&
        !HOP_BY_HOP_HEADERS.has(key.toLowerCase())
      ) {
        headers[key] = value;
      }
    }

    const hasBody =
      req.body !== undefined &&
      req.body !== null &&
      Object.keys(req.body as Record<string, unknown>).length > 0;

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
      });
    } catch {
      // Protected API unreachable — see docs/architecture.md §16 Failure Handling.
      return {
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'Protected API is unavailable',
        }),
      };
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    const body = await response.text();
    return { status: response.status, headers: responseHeaders, body };
  }
}
