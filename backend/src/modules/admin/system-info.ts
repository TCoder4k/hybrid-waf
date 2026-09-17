import { loadRateLimitConfig } from '../rate-limit/rate-limit.config';
import { resolveWafMode, WafMode } from '../../common/waf-mode.util';

// Read via require(), not `import ... assert { type: 'json' }` — avoids
// adding `resolveJsonModule` to tsconfig.json for a single-field read.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../../package.json') as { version: string };

export interface RateLimitSummary {
  perIpRatePerSecond: number;
  perIpBurst: number;
  globalRatePerSecond: number;
  globalBurst: number;
  maxConcurrency: number;
}

export interface SystemInfo {
  version: string;
  environment: string;
  uptimeSeconds: number;
  serverTime: string; // ISO 8601
  mlConfidenceThreshold: number;
  // Phase P5/P6 (docs/architecture.md §22/§23) — read-only display only,
  // sourced straight from env config (same pattern as
  // mlConfidenceThreshold above); no runtime mutation exists yet (see the
  // Settings page's own "Cấu hình phát hiện" card, still read-only for the
  // same reason — no DB-backed settings store exists, an explicitly
  // deferred, separate feature).
  wafMode: WafMode;
  rateLimit: RateLimitSummary;
}

// A plain function, not an injectable service — nothing here needs DI
// (matches the bucket.util.ts pure-utility precedent). Computed fresh on
// every call (not cached at module load) so `uptimeSeconds`/`serverTime`
// are always current.
export function buildSystemInfo(): SystemInfo {
  const configuredThreshold = Number(process.env.ML_CONFIDENCE_THRESHOLD);
  return {
    version,
    environment: process.env.NODE_ENV ?? 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: new Date().toISOString(),
    mlConfidenceThreshold: Number.isFinite(configuredThreshold)
      ? configuredThreshold
      : 0.7,
    wafMode: resolveWafMode(),
    rateLimit: loadRateLimitConfig(),
  };
}
