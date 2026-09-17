import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { rawBodyCapture } from './common/raw-body-capture.middleware';
import { resolveUpstreamUrl } from './common/upstream-config.util';

// Phase P2 (docs/architecture.md §22): a request-size backstop and
// slowloris (slow-header/slow-body) protection, both previously entirely
// implicit/unconfigured. All three are configurable so a real deployment
// can tune them to its own traffic instead of being stuck with these
// defaults.
const MAX_BODY_SIZE_BYTES = Number(
  process.env.MAX_BODY_SIZE_BYTES ?? 1_048_576, // 1 MiB
);
const REQUEST_HEADERS_TIMEOUT_MS = Number(
  process.env.REQUEST_HEADERS_TIMEOUT_MS ?? 15_000,
);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);

async function bootstrap() {
  // Fail fast on a malformed UPSTREAM_URL/PROTECTED_API_URL rather than
  // silently accepting it and 502ing every single request forever (Phase
  // P1, ADR-8, docs/architecture.md §21). UpstreamProxyService/
  // SystemStatusService still re-resolve this per-call (unchanged, keeps
  // the target swappable without a restart) — this is purely a boot-time
  // sanity check, not a cache.
  try {
    resolveUpstreamUrl();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Explicit body-size limit (Phase P2) — previously whatever Nest's
  // default bodyParser:true shipped with, unconfigured and undocumented.
  // Applies globally (admin/auth JSON bodies included), same as before.
  app.useBodyParser('json', { limit: MAX_BODY_SIZE_BYTES });
  app.useBodyParser('urlencoded', {
    limit: MAX_BODY_SIZE_BYTES,
    extended: true,
  });
  // Captures the raw bytes for every OTHER content type (multipart/binary/
  // none) so UpstreamProxyService can forward them byte-for-byte instead of
  // silently dropping them — see raw-body-capture.middleware.ts. No-ops for
  // json/urlencoded requests (already handled above), so registration order
  // relative to the two calls above doesn't matter.
  app.use(rawBodyCapture(MAX_BODY_SIZE_BYTES));

  // Nginx (docker-compose.prod.yml) is the only path in, but it reaches this
  // container through Docker's published-port NAT, not literally over
  // loopback — from inside the container the connecting peer shows up as the
  // Docker bridge gateway (e.g. 172.x.0.1), not 127.0.0.1. 'loopback' alone
  // would NOT match that, silently leaving every request's sourceIp as the
  // bridge gateway instead of the real client. 'uniquelocal' additionally
  // trusts RFC1918 private ranges, which covers the bridge network without
  // trusting arbitrary internet IPs (the backend port is never published to
  // the internet — see docker-compose.prod.yml). This is what lets Express
  // resolve req.ip from the X-Forwarded-For header Nginx sets, instead of
  // Nginx's own address, so SecurityEvent.sourceIp reflects the real client.
  app.set('trust proxy', 'uniquelocal');

  // The Dashboard (frontend/, Phase 10) is a browser app on a different
  // origin — scoped to one configurable origin, never a wildcard, per
  // docs/architecture.md §17 (least-privilege). No FRONTEND_URL means no
  // cross-origin admin API access at all.
  if (process.env.FRONTEND_URL) {
    app.enableCors({ origin: process.env.FRONTEND_URL });
  }

  await app.listen(process.env.PORT ?? 3000);

  // Slowloris protection (Phase P2, docs/architecture.md §22): a request
  // that never finishes sending its headers, or never completes at all,
  // used to be able to hold a connection open indefinitely (Node's own
  // defaults are 60s/300s — generous enough to be a real DoS knob). Set
  // directly on the underlying http.Server, which is what app.listen()
  // returns/what getHttpServer() exposes — Nest has no higher-level API for
  // these two.
  const httpServer = app.getHttpServer();
  httpServer.headersTimeout = REQUEST_HEADERS_TIMEOUT_MS;
  httpServer.requestTimeout = REQUEST_TIMEOUT_MS;
}
void bootstrap();
