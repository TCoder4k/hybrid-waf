import {
  DecisionResult,
  DetectionResult,
  MLDetectionResult,
  NormalizedRequest,
} from '../../common/types';
import { SecurityEventLogger } from './security-event-logger.service';
import { SecurityEventRepository } from './security-event.repository';

function makeRequest(
  overrides: Partial<NormalizedRequest> = {},
): NormalizedRequest {
  return {
    method: 'GET',
    url: '/api/hello?id=1%20OR%201=1',
    endpoint: '/api/hello',
    queryParams: { id: '1 OR 1=1' },
    pathParams: {},
    body: { secret: 'should-not-be-stored' },
    sourceIp: '203.0.113.9',
    headers: { authorization: 'Bearer should-not-be-stored' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const ruleBlockResult: DetectionResult = {
  classification: 'SQL_INJECTION',
  detected: true,
  confidence: null,
  reason: 'boolean-based tautology',
};

const ruleNormalResult: DetectionResult = {
  classification: 'NORMAL',
  detected: false,
  confidence: null,
  reason: 'no rule matched',
};

const mlAvailableAttack: MLDetectionResult = {
  status: 'AVAILABLE',
  classification: 'SQL_INJECTION',
  confidence: 0.9,
  reason: 'ML model predicted SQL_INJECTION',
};

const mlUnavailable: MLDetectionResult = {
  status: 'UNAVAILABLE',
  classification: null,
  confidence: null,
  reason: 'ML service timeout',
};

const blockByRuleDecision: DecisionResult = {
  classification: 'SQL_INJECTION',
  action: 'BLOCK',
  reason: 'rule match: boolean-based tautology',
};

describe('SecurityEventLogger', () => {
  function makeLogger() {
    const createMock = jest
      .fn<Promise<unknown>, [Record<string, unknown>]>()
      .mockResolvedValue({});
    const repository = {
      create: createMock,
    } as unknown as SecurityEventRepository;
    const logger = new SecurityEventLogger(repository);
    return { logger, createMock };
  }

  it('persists a SecurityEvent with the redacted fields for a rule-caused BLOCK', async () => {
    const { logger, createMock } = makeLogger();
    const request = makeRequest();

    await logger.logBlock(
      request,
      ruleBlockResult,
      mlUnavailable,
      blockByRuleDecision,
    );

    expect(createMock).toHaveBeenCalledWith({
      sourceIp: '203.0.113.9',
      method: 'GET',
      endpoint: '/api/hello',
      attackType: 'SQL_INJECTION',
      ruleResult: ruleBlockResult,
      mlResult: mlUnavailable,
      confidence: null,
      decision: 'BLOCK',
      requestMeta: {
        endpoint: '/api/hello',
        queryParams: { id: '1 OR 1=1' },
        pathParams: {},
      },
    });
  });

  it('sets confidence from the ML result when ML is AVAILABLE', async () => {
    const { logger, createMock } = makeLogger();

    await logger.logBlock(makeRequest(), ruleNormalResult, mlAvailableAttack, {
      classification: 'SQL_INJECTION',
      action: 'BLOCK',
      reason: 'ml match: ML model predicted SQL_INJECTION',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 0.9 }),
    );
  });

  it('never includes the raw request body or headers in requestMeta', async () => {
    const { logger, createMock } = makeLogger();

    await logger.logBlock(
      makeRequest(),
      ruleBlockResult,
      mlUnavailable,
      blockByRuleDecision,
    );

    const payload = createMock.mock.calls[0][0];
    const requestMeta = payload.requestMeta as Record<string, unknown>;
    expect(requestMeta).not.toHaveProperty('body');
    expect(requestMeta).not.toHaveProperty('headers');
    expect(Object.keys(requestMeta).sort()).toEqual([
      'endpoint',
      'pathParams',
      'queryParams',
    ]);
  });

  it('does not throw when the repository fails to write (DB outage must not weaken the BLOCK decision)', async () => {
    const createMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const repository = {
      create: createMock,
    } as unknown as SecurityEventRepository;
    const logger = new SecurityEventLogger(repository);

    await expect(
      logger.logBlock(
        makeRequest(),
        ruleBlockResult,
        mlUnavailable,
        blockByRuleDecision,
      ),
    ).resolves.toBeUndefined();
  });
});
