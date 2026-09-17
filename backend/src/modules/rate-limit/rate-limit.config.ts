// Single source of truth for rate-limit configuration (Phase P3,
// docs/architecture.md §22, ADR-9). Read once at RateLimitGuard
// construction (unlike resolveUpstreamUrl(), which is deliberately
// re-read per request) — the token buckets themselves are stateful
// singletons, so their configured rate/burst isn't meaningful to
// hot-swap mid-run the way a stateless forwarding target is.
//
// Env-var-only for now (Phase P3 scope) — dashboard-editable settings are
// an explicitly deferred, separate, larger feature (optional Phase P9, see
// docs/architecture.md §22 and the initiative's plan).
export interface RateLimitConfig {
  perIpRatePerSecond: number;
  perIpBurst: number;
  globalRatePerSecond: number;
  globalBurst: number;
  maxConcurrency: number;
}

const DEFAULTS: RateLimitConfig = {
  perIpRatePerSecond: 20,
  perIpBurst: 40,
  globalRatePerSecond: 200,
  globalBurst: 400,
  maxConcurrency: 100,
};

function readPositiveInt(envVar: string, fallback: number): number {
  const parsed = Number(process.env[envVar]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadRateLimitConfig(): RateLimitConfig {
  return {
    perIpRatePerSecond: readPositiveInt(
      'RATE_LIMIT_PER_IP_RPS',
      DEFAULTS.perIpRatePerSecond,
    ),
    perIpBurst: readPositiveInt('RATE_LIMIT_PER_IP_BURST', DEFAULTS.perIpBurst),
    globalRatePerSecond: readPositiveInt(
      'RATE_LIMIT_GLOBAL_RPS',
      DEFAULTS.globalRatePerSecond,
    ),
    globalBurst: readPositiveInt(
      'RATE_LIMIT_GLOBAL_BURST',
      DEFAULTS.globalBurst,
    ),
    maxConcurrency: readPositiveInt(
      'RATE_LIMIT_MAX_CONCURRENCY',
      DEFAULTS.maxConcurrency,
    ),
  };
}
