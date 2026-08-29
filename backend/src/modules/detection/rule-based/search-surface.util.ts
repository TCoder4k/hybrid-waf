import { NormalizedRequest } from '../../../common/types';

// Concatenates the request fields most likely to carry an injection payload
// into one string for pattern matching. Deliberately excludes pathParams —
// see docs/memory.md Phase 4 finding (not meaningful under the WAF's
// catch-all route) — and headers (out of scope for SQLi/XSS signatures here).
export function buildSearchSurface(request: NormalizedRequest): string {
  return [
    request.endpoint,
    JSON.stringify(request.queryParams ?? {}),
    JSON.stringify(request.body ?? ''),
  ].join(' ');
}
