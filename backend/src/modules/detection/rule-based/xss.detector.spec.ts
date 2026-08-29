import { NormalizedRequest } from '../../../common/types';
import { XssRuleDetector } from './xss.detector';

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

describe('XssRuleDetector', () => {
  const detector = new XssRuleDetector();

  const attackPayloads: Array<[string, Partial<NormalizedRequest>]> = [
    ['script tag', { queryParams: { q: '<script>alert(1)</script>' } }],
    ['javascript: URI', { queryParams: { redirect: 'javascript:alert(1)' } }],
    [
      'inline onerror handler',
      { body: { comment: '<img src=x onerror=alert(1)>' } },
    ],
    ['svg onload payload', { body: { comment: '<svg/onload=alert(1)>' } }],
    ['iframe tag', { queryParams: { q: '<iframe src="evil.com"></iframe>' } }],
    [
      'document.cookie access',
      { body: { comment: '<script>fetch(document.cookie)</script>' } },
    ],
  ];

  it.each(attackPayloads)('detects: %s', (_label, overrides) => {
    const result = detector.detect(makeRequest(overrides));
    expect(result.detected).toBe(true);
    expect(result.classification).toBe('XSS');
    expect(result.reason).toContain('XSS pattern matched');
  });

  const benignPayloads: Array<[string, Partial<NormalizedRequest>]> = [
    [
      'plain text comment',
      { body: { comment: 'Great product, will buy again!' } },
    ],
    ['normal query', { queryParams: { q: 'best coffee near me' } }],
    ['no params at all', {}],
  ];

  it.each(benignPayloads)('does not flag: %s', (_label, overrides) => {
    const result = detector.detect(makeRequest(overrides));
    expect(result.detected).toBe(false);
    expect(result.classification).toBe('NORMAL');
  });
});
