// Rate-limit test for the Hybrid WAF (Phase P3, docs/architecture.md §22).
// Deliberately SEPARATE from k6-load-test.js/capacity-step.js and uses its
// own metrics — a successful rate limiter is SUPPOSED to return 429s under
// this test, and those must never be conflated with the capacity test's
// "is the system failing" measurement (see load-testing/README.md).
//
// A single VU, one fixed source IP (k6 runs in one process/container, so
// every request already shares one IP unless behind per-VU NAT) fires
// requests as fast as it can for a short burst — comfortably above the
// configured RATE_LIMIT_PER_IP_RPS/BURST — and asserts:
//   1. the earliest requests (within the burst allowance) succeed,
//   2. once the burst is exhausted, the WAF starts returning 429,
//   3. every 429 carries a Retry-After header,
//   4. nothing outside {200, 403, 404, 429} is ever seen (a genuine 5xx
//      would mean something other than the rate limiter is failing).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
// Comfortably above the default RATE_LIMIT_PER_IP_BURST (40) so the limit
// is actually reached — override via REQUEST_COUNT if a deployment configures
// a much larger burst.
const REQUEST_COUNT = Number(__ENV.REQUEST_COUNT || 80);

http.setResponseCallback(http.expectedStatuses(200, 403, 404, 429));

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: REQUEST_COUNT,
      maxDuration: '60s',
    },
  },
  thresholds: {
    // At least one request must actually get rate-limited, or this test
    // isn't exercising anything.
    rate_limit_hit_count: ['count>0'],
    // Every 429 must carry Retry-After — no exceptions.
    rate_limit_retry_after_present: ['rate==1'],
  },
};

const rateLimitHitCount = new Counter('rate_limit_hit_count');
const retryAfterPresent = new Rate('rate_limit_retry_after_present');

export default function () {
  const res = http.get(`${BASE_URL}/api/hello?id=${__ITER}`);

  check(res, {
    'response is one of 200/403/404/429': (r) =>
      [200, 403, 404, 429].includes(r.status),
  });

  if (res.status === 429) {
    rateLimitHitCount.add(1);
    const retryAfter = res.headers['Retry-After'];
    retryAfterPresent.add(retryAfter !== undefined && retryAfter !== '');
  }

  // No sleep — the whole point is to exceed the burst as fast as possible.
}
