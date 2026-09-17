// One fixed-concurrency step, run repeatedly at increasing VUS to build a
// capacity curve (VUs -> p95 latency, error rate) instead of one long ramp.
// Short duration per step (default 15s) so a bad step is cheap to detect and
// stop before hammering the production VPS further.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://hybrid-waf.duckdns.org';
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '15s';

http.setResponseCallback(http.expectedStatuses(200, 403, 404));

export const options = {
  scenarios: {
    step: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // Safety net: if this step is already unhealthy, abort fast instead of
    // grinding through the full duration at a broken concurrency level.
    http_req_failed: [{ threshold: 'rate<0.15', abortOnFail: true, delayAbortEval: '5s' }],
  },
};

const benignValues = ['1', '42', 'coffee or tea'];
const sqliValues = [`' OR '1'='1`, '1 UNION SELECT username,password FROM users'];
const xssValues = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const r = Math.random();
  let url;
  if (r < 0.7) {
    url = `${BASE_URL}/api/hello?id=${encodeURIComponent(pick(benignValues))}`;
  } else if (r < 0.85) {
    url = `${BASE_URL}/api/hello?id=${encodeURIComponent(pick(sqliValues))}`;
  } else {
    url = `${BASE_URL}/api/hello?q=${encodeURIComponent(pick(xssValues))}`;
  }
  const res = http.get(url);
  check(res, { 'got a response (not a network error)': (rr) => rr.status !== 0 });
  sleep(0.1);
}
