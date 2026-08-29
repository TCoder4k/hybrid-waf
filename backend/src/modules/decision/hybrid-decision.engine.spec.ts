import {
  DetectionResult,
  MLDetectionResult,
  NormalizedRequest,
} from '../../common/types';
import { HybridDecisionEngine } from './hybrid-decision.engine';

function makeRequest(): NormalizedRequest {
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
  };
}

function ruleResult(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    classification: 'NORMAL',
    detected: false,
    confidence: null,
    reason: 'no rule matched',
    ...overrides,
  };
}

function mlAvailable(
  overrides: Partial<Extract<MLDetectionResult, { status: 'AVAILABLE' }>> = {},
): MLDetectionResult {
  return {
    status: 'AVAILABLE',
    classification: 'NORMAL',
    confidence: 0.5,
    reason: 'ML model predicted NORMAL',
    ...overrides,
  };
}

function mlUnavailable(reason = 'ML service timeout'): MLDetectionResult {
  return {
    status: 'UNAVAILABLE',
    classification: null,
    confidence: null,
    reason,
  };
}

describe('HybridDecisionEngine', () => {
  const originalThreshold = process.env.ML_CONFIDENCE_THRESHOLD;

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.ML_CONFIDENCE_THRESHOLD;
    } else {
      process.env.ML_CONFIDENCE_THRESHOLD = originalThreshold;
    }
  });

  // Scenario 1: rule detected + ML available (agreeing) -> BLOCK via rule
  it('BLOCKs on rule detection when ML agrees', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult({
        classification: 'SQL_INJECTION',
        detected: true,
        reason: 'boolean-based tautology',
      }),
      mlAvailable({ classification: 'SQL_INJECTION', confidence: 0.95 }),
    );

    expect(decision).toEqual({
      classification: 'SQL_INJECTION',
      action: 'BLOCK',
      reason: 'rule match: boolean-based tautology',
    });
  });

  // Scenario 5: rule/ML disagreement — rule fires, ML disagrees (says NORMAL) -> rule still wins
  it('BLOCKs on rule detection even when ML disagrees and reports NORMAL', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult({
        classification: 'XSS',
        detected: true,
        reason: '<script> tag detected',
      }),
      mlAvailable({ classification: 'NORMAL', confidence: 0.99 }),
    );

    expect(decision.action).toBe('BLOCK');
    expect(decision.classification).toBe('XSS');
  });

  // Scenario 2: rule normal + ML high-confidence attack -> BLOCK via ML
  it('BLOCKs on ML high-confidence attack when rules found nothing', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult(),
      mlAvailable({
        classification: 'SQL_INJECTION',
        confidence: 0.9,
        reason: 'ML model predicted SQL_INJECTION',
      }),
    );

    expect(decision).toEqual({
      classification: 'SQL_INJECTION',
      action: 'BLOCK',
      reason: 'ml match: ML model predicted SQL_INJECTION',
    });
  });

  // Scenario 6: ML confidence threshold — attack classification but below threshold -> ALLOW
  it('ALLOWs when ML reports an attack below the confidence threshold', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult(),
      mlAvailable({ classification: 'XSS', confidence: 0.4 }),
    );

    expect(decision.action).toBe('ALLOW');
    expect(decision.classification).toBe('NORMAL');
    expect(decision.reason).toContain('below confidence threshold');
  });

  // Scenario 6 continued: confidence exactly at the threshold -> BLOCK (>=, not >)
  it('BLOCKs when ML confidence is exactly at the threshold', () => {
    process.env.ML_CONFIDENCE_THRESHOLD = '0.7';
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult(),
      mlAvailable({ classification: 'SQL_INJECTION', confidence: 0.7 }),
    );

    expect(decision.action).toBe('BLOCK');
  });

  // Scenario 6 continued: threshold is configurable via env var
  it('uses a configured ML_CONFIDENCE_THRESHOLD instead of the default', () => {
    process.env.ML_CONFIDENCE_THRESHOLD = '0.3';
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult(),
      mlAvailable({ classification: 'SQL_INJECTION', confidence: 0.35 }),
    );

    expect(decision.action).toBe('BLOCK');
  });

  // Scenario 3: ML UNAVAILABLE, rule normal -> ALLOW (rule is the deterministic fallback)
  it('ALLOWs when rule is normal and ML is UNAVAILABLE', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult(),
      mlUnavailable(),
    );

    expect(decision).toEqual({
      classification: 'NORMAL',
      action: 'ALLOW',
      reason: 'rule: normal; ml: unavailable',
    });
  });

  // Scenario 3 continued: rule fires while ML is UNAVAILABLE -> still BLOCK via rule
  it('BLOCKs on rule detection even when ML is UNAVAILABLE', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult({
        classification: 'SQL_INJECTION',
        detected: true,
        reason: 'UNION SELECT detected',
      }),
      mlUnavailable(),
    );

    expect(decision.action).toBe('BLOCK');
    expect(decision.classification).toBe('SQL_INJECTION');
  });

  // Scenario 4: both NORMAL -> ALLOW
  it('ALLOWs when both rule and ML report NORMAL', () => {
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(makeRequest(), ruleResult(), mlAvailable());

    expect(decision).toEqual({
      classification: 'NORMAL',
      action: 'ALLOW',
      reason: 'rule: normal; ml: normal',
    });
  });

  it('falls back to the default threshold when the env var is not a valid number', () => {
    process.env.ML_CONFIDENCE_THRESHOLD = 'not-a-number';
    const engine = new HybridDecisionEngine();
    const decision = engine.decide(
      makeRequest(),
      ruleResult(),
      mlAvailable({ classification: 'XSS', confidence: 0.71 }),
    );

    expect(decision.action).toBe('BLOCK');
  });
});
