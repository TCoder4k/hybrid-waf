import { NormalizedRequest } from '../../../common/types';
import { RuleDetectionEngine } from './rule-detection.engine';
import { SqlInjectionRuleDetector } from './sql-injection.detector';
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

describe('RuleDetectionEngine', () => {
  const engine = new RuleDetectionEngine(
    new SqlInjectionRuleDetector(),
    new XssRuleDetector(),
  );

  it('returns NORMAL when neither detector fires', () => {
    const result = engine.detect(makeRequest({ queryParams: { id: '42' } }));
    expect(result).toEqual({
      classification: 'NORMAL',
      detected: false,
      confidence: null,
      reason: 'no rule matched',
    });
  });

  it('returns SQL_INJECTION when the SQLi detector fires', () => {
    const result = engine.detect(
      makeRequest({ queryParams: { id: '1 OR 1=1' } }),
    );
    expect(result.detected).toBe(true);
    expect(result.classification).toBe('SQL_INJECTION');
  });

  it('returns XSS when only the XSS detector fires', () => {
    const result = engine.detect(
      makeRequest({ queryParams: { q: '<script>alert(1)</script>' } }),
    );
    expect(result.detected).toBe(true);
    expect(result.classification).toBe('XSS');
  });

  it('prefers SQLi over XSS when both patterns are present', () => {
    const result = engine.detect(
      makeRequest({
        queryParams: {
          a: '1 OR 1=1',
          b: '<script>alert(1)</script>',
        },
      }),
    );
    expect(result.classification).toBe('SQL_INJECTION');
  });
});
