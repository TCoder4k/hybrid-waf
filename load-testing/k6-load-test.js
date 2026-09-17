// Load test for the Hybrid WAF (backend/WafController -> detection -> decision
// -> protected-api). Run with k6 (see README.md in this folder for how, via
// Docker so nothing needs installing).
//
// Traffic mix: mostly benign requests (should always pass through with a
// non-403 response), plus a smaller share of real SQLi/XSS payloads (should
// always come back 403). This exercises the real pipeline end to end —
// Request Normalization -> Rule + ML detection (parallel) -> Hybrid Decision
// Engine -> SecurityEvent logging (on BLOCK) / forward to Protected API (on
// ALLOW) — under concurrency, not just a single request at a time.
//
// Load level is intentionally conservative by default (max 10 concurrent
// VUs) because the default BASE_URL is the real production VPS
// (hybrid-waf.duckdns.org) — a small VPS, and this is a live demo instance,
// not a disposable load-test target. Scale up gradually via the STAGE_*
// env vars once a light run confirms the target handles it.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://hybrid-waf.duckdns.org';
const MAX_VUS = Number(__ENV.MAX_VUS || 10);

// 403 (blocked attack) and 404 (benign hitting a protected-api path that
// doesn't exist under the Nginx /api-prefix-stripped routing) are both
// EXPECTED outcomes here, not failures — without this, k6's built-in
// http_req_failed treats every non-2xx/3xx response as a failure and the
// metric is meaningless for this test.
http.setResponseCallback(http.expectedStatuses(200, 403, 404));

const blockRate = new Rate('waf_attack_block_rate'); // should stay 1.0
const falseBlockRate = new Rate('waf_benign_block_rate'); // should stay 0.0
const benignLatency = new Trend('latency_benign_ms');
const attackLatency = new Trend('latency_attack_ms');

export const options = {
  scenarios: {
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: Math.ceil(MAX_VUS / 2) },
        { duration: '20s', target: Math.ceil(MAX_VUS / 2) },
        { duration: '10s', target: MAX_VUS },
        { duration: '20s', target: MAX_VUS },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Overall HTTP-level health of the target under load.
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
    // Correctness must hold even under concurrency, not just at low load.
    waf_attack_block_rate: ['rate>0.99'],
    waf_benign_block_rate: ['rate<0.01'],
  },
};

// Values only — encodeURIComponent() is applied when the URL is built, so
// raw spaces/quotes/angle-brackets here never hit the wire un-encoded (an
// earlier version of this script sent them raw and silently mangled the
// request line, making most attack payloads never actually reach the rule
// engine intact).
const benignValues = ['1', '42', 'coffee or tea', 'please select your country'];

const sqliValues = [
  `' OR '1'='1`,
  '1 UNION SELECT username,password FROM users',
  '1; DROP TABLE users;--',
  '1 OR SLEEP(1)',
];

const xssValues = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildUrl(param, value) {
  return `${BASE_URL}/api/hello?${param}=${encodeURIComponent(value)}`;
}

export default function () {
  const r = Math.random();
  let url;
  let isAttack = false;

  if (r < 0.7) {
    url = buildUrl('id', pick(benignValues));
  } else if (r < 0.85) {
    url = buildUrl('id', pick(sqliValues));
    isAttack = true;
  } else {
    url = buildUrl('q', pick(xssValues));
    isAttack = true;
  }

  const res = http.get(url, {
    tags: { kind: isAttack ? 'attack' : 'benign' },
  });

  if (isAttack) {
    attackLatency.add(res.timings.duration);
    blockRate.add(res.status === 403);
    check(res, { 'attack payload blocked (403)': (rr) => rr.status === 403 });
  } else {
    benignLatency.add(res.timings.duration);
    falseBlockRate.add(res.status === 403);
    check(res, { 'benign request not blocked': (rr) => rr.status !== 403 });
  }

  sleep(Math.random() * 0.5 + 0.2);
}
