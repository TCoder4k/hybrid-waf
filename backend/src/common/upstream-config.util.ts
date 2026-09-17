// Single source of truth for resolving the WAF's forwarding target. Per
// docs/architecture.md §21 (ADR-8, Phase P1): UPSTREAM_URL is the canonical
// env var — any web/API can be protected, not just the bundled demo
// `protected-api` service. PROTECTED_API_URL is read as a temporary
// backward-compatible alias so existing deployments/tests don't break
// mid-migration; UPSTREAM_URL always wins when both are set.
//
// Deliberately NOT memoized/cached — callers read this fresh per use (both
// UpstreamProxyService.forward() and SystemStatusService ping this on every
// call), so changing the env var (e.g. between test cases, or via a
// container restart) takes effect immediately without an app restart being
// required for the value itself to be picked up.
const DEFAULT_UPSTREAM_URL = 'http://localhost:3001';

export class InvalidUpstreamUrlError extends Error {}

export function resolveUpstreamUrl(): string {
  const raw =
    process.env.UPSTREAM_URL ??
    process.env.PROTECTED_API_URL ??
    DEFAULT_UPSTREAM_URL;

  try {
    new URL(raw);
  } catch {
    throw new InvalidUpstreamUrlError(
      `Invalid upstream configuration: "${raw}" is not a valid absolute URL. ` +
        'Set UPSTREAM_URL (preferred) or PROTECTED_API_URL to a valid absolute URL, e.g. http://protected-api:3001.',
    );
  }

  return raw;
}
