import http from 'k6/http';
export const options = { vus: 1, iterations: 8 };
const BASE_URL = __ENV.BASE_URL || 'https://hybrid-waf.duckdns.org';
const cases = [
  ['id', '1', 'benign'],
  [
    'id',
    "' OR '1'='1",
    'sqli',
  ],
  ['id', '1 UNION SELECT username,password FROM users', 'sqli'],
  ['id', '1; DROP TABLE users;--', 'sqli'],
  ['id', '1 OR SLEEP(1)', 'sqli'],
  ['q', '<script>alert(1)</script>', 'xss'],
  ['q', '<img src=x onerror=alert(1)>', 'xss'],
  ['q', '<svg onload=alert(1)>', 'xss'],
];
export default function () {
  const i = (__ITER) % cases.length;
  const [param, value, kind] = cases[i];
  const url = `${BASE_URL}/api/hello?${param}=${encodeURIComponent(value)}`;
  const res = http.get(url);
  console.log(`${kind.padEnd(6)} status=${res.status} url=${url}`);
}
