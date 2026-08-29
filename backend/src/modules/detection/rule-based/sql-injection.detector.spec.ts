import { NormalizedRequest } from '../../../common/types';
import { SqlInjectionRuleDetector } from './sql-injection.detector';

function makeRequest(
  overrides: Partial<NormalizedRequest> = {},
): NormalizedRequest {
  return {
    method: 'GET',
    url: '/api/hello',
    endpoint: '/api/hello',
    queryParams: {},
    pathParams: {},
    body: undefined,
    sourceIp: '203.0.113.9',
    headers: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('SqlInjectionRuleDetector', () => {
  const detector = new SqlInjectionRuleDetector();

  const attackPayloads: Array<[string, Partial<NormalizedRequest>]> = [
    ['boolean tautology in query param', { queryParams: { id: '1 OR 1=1' } }],
    [
      'classic quote tautology',
      { queryParams: { username: "admin' OR '1'='1" } },
    ],
    [
      'UNION SELECT',
      { queryParams: { id: '1 UNION SELECT username, password FROM users' } },
    ],
    ['stacked query', { queryParams: { id: '1; DROP TABLE users' } }],
    ['SQL comment sequence', { queryParams: { id: "1' --" } }],
    ['time-based blind SQLi', { body: { id: '1 OR SLEEP(5)' } }],
    ['xp_cmdshell', { body: { cmd: "'; EXEC xp_cmdshell('dir'); --" } }],
  ];

  it.each(attackPayloads)('detects: %s', (_label, overrides) => {
    const result = detector.detect(makeRequest(overrides));
    expect(result.detected).toBe(true);
    expect(result.classification).toBe('SQL_INJECTION');
    expect(result.reason).toContain('SQL Injection pattern matched');
  });

  const benignPayloads: Array<[string, Partial<NormalizedRequest>]> = [
    ['plain numeric id', { queryParams: { id: '42' } }],
    ['normal username', { body: { username: 'alice', password: 'hunter2' } }],
    ['sentence containing "or"', { queryParams: { q: 'coffee or tea' } }],
    ['no params at all', {}],
  ];

  it.each(benignPayloads)('does not flag: %s', (_label, overrides) => {
    const result = detector.detect(makeRequest(overrides));
    expect(result.detected).toBe(false);
    expect(result.classification).toBe('NORMAL');
  });
});
