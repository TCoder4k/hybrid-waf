import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { HybridDecisionEngine } from '../decision/hybrid-decision.engine';
import { MLDetectionEngine } from '../detection/ml/ml-detection.engine';
import { RuleDetectionEngine } from '../detection/rule-based/rule-detection.engine';
import { SqlInjectionRuleDetector } from '../detection/rule-based/sql-injection.detector';
import { XssRuleDetector } from '../detection/rule-based/xss.detector';
import { RequestNormalizerService } from '../request/request-normalizer.service';
import { SecurityEventLogger } from '../security-events/security-event-logger.service';
import { SecurityEventRepository } from '../security-events/security-event.repository';
import { TrafficMetricsRecorder } from '../traffic-metrics/traffic-metrics.recorder';
import { ProtectedApiClientService } from './protected-api-client.service';
import { WafService } from './waf.service';

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/hello?id=1',
    headers: {},
    query: { id: '1' },
    params: {},
    body: undefined,
    ip: '203.0.113.9',
    ...overrides,
  } as unknown as Request;
}

function makeService(
  securityEventRepositoryCreate: jest.Mock = jest.fn().mockResolvedValue({}),
  trafficMetricsRecord: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  const normalizer = new RequestNormalizerService();
  const ruleDetectionEngine = new RuleDetectionEngine(
    new SqlInjectionRuleDetector(),
    new XssRuleDetector(),
  );
  const mlDetectionEngine = new MLDetectionEngine();
  const mlDetectSpy = jest
    .spyOn(mlDetectionEngine, 'detect')
    .mockResolvedValue({
      status: 'UNAVAILABLE',
      classification: null,
      confidence: null,
      reason: 'stubbed in test',
    });
  const decisionEngine = new HybridDecisionEngine();

  const securityEventRepository = {
    create: securityEventRepositoryCreate,
  } as unknown as SecurityEventRepository;
  const securityEventLogger = new SecurityEventLogger(securityEventRepository);
  const logBlockSpy = jest.spyOn(securityEventLogger, 'logBlock');

  const trafficMetricsRecorder = {
    record: trafficMetricsRecord,
  } as unknown as TrafficMetricsRecorder;

  const forwardMock = jest
    .fn()
    .mockResolvedValue({ status: 200, headers: {}, body: '{}' });
  const protectedApiClient = {
    forward: forwardMock,
  } as unknown as ProtectedApiClientService;

  const service = new WafService(
    normalizer,
    ruleDetectionEngine,
    mlDetectionEngine,
    decisionEngine,
    securityEventLogger,
    trafficMetricsRecorder,
    protectedApiClient,
  );

  return {
    service,
    normalizer,
    ruleDetectionEngine,
    mlDetectSpy,
    forwardMock,
    securityEventRepositoryCreate,
    logBlockSpy,
    trafficMetricsRecord,
  };
}

describe('WafService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes, runs rule + ML detection, then forwards an ALLOWed request to Protected API', async () => {
    const {
      service,
      normalizer,
      ruleDetectionEngine,
      mlDetectSpy,
      forwardMock,
      logBlockSpy,
      trafficMetricsRecord,
    } = makeService();
    const normalizeSpy = jest.spyOn(normalizer, 'normalize');
    const ruleDetectSpy = jest.spyOn(ruleDetectionEngine, 'detect');
    const req = makeRequest();

    const result = await service.handle(req);

    expect(normalizeSpy).toHaveBeenCalledWith(req);
    expect(ruleDetectSpy).toHaveBeenCalled();
    expect(mlDetectSpy).toHaveBeenCalled();
    expect(forwardMock).toHaveBeenCalledWith(req);
    expect(result.status).toBe(200);
    expect(logBlockSpy).not.toHaveBeenCalled();
    expect(trafficMetricsRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ALLOW' }),
    );
  });

  it('returns 403, logs a SecurityEvent, and never forwards when the rule engine detects an attack', async () => {
    const {
      service,
      forwardMock,
      securityEventRepositoryCreate,
      logBlockSpy,
      trafficMetricsRecord,
    } = makeService();
    const req = makeRequest({
      originalUrl: '/api/hello?id=1%20OR%201=1',
      query: { id: '1 OR 1=1' },
    });

    const result = await service.handle(req);

    expect(forwardMock).not.toHaveBeenCalled();
    expect(result.status).toBe(403);
    const body: unknown = JSON.parse(result.body);
    expect(body).toMatchObject({ statusCode: 403, error: 'Forbidden' });

    expect(logBlockSpy).toHaveBeenCalledTimes(1);
    expect(securityEventRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        attackType: 'SQL_INJECTION',
        decision: 'BLOCK',
      }),
    );
    expect(trafficMetricsRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BLOCK',
        classification: 'SQL_INJECTION',
      }),
    );
  });

  it('still forwards (ALLOW) when the rule engine is normal and the ML engine is UNAVAILABLE', async () => {
    const { service, forwardMock, logBlockSpy } = makeService();
    const result = await service.handle(makeRequest());

    expect(forwardMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(logBlockSpy).not.toHaveBeenCalled();
  });

  it('still returns 403 and never forwards when the SecurityEvent write fails (DB outage must not weaken BLOCK)', async () => {
    const failingCreate = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const { service, forwardMock } = makeService(failingCreate);
    const req = makeRequest({
      originalUrl: '/api/hello?id=1%20OR%201=1',
      query: { id: '1 OR 1=1' },
    });

    const result = await service.handle(req);

    expect(failingCreate).toHaveBeenCalledTimes(1);
    expect(forwardMock).not.toHaveBeenCalled();
    expect(result.status).toBe(403);
  });

  it('does not await traffic-metrics recording and still ALLOWs when it rejects, with no unhandled rejection', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const rejectingRecord = jest
      .fn()
      .mockRejectedValue(new Error('metrics DB unreachable'));
    const { service, forwardMock } = makeService(undefined, rejectingRecord);

    const result = await service.handle(makeRequest());

    expect(result.status).toBe(200);
    expect(forwardMock).toHaveBeenCalledTimes(1);

    // Let the fire-and-forgotten rejection settle and be caught.
    await new Promise((resolve) => process.nextTick(resolve));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to record traffic metrics'),
    );
  });

  it('does not await traffic-metrics recording and still BLOCKs when it rejects, with no unhandled rejection', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const rejectingRecord = jest
      .fn()
      .mockRejectedValue(new Error('metrics DB unreachable'));
    const { service, forwardMock } = makeService(undefined, rejectingRecord);
    const req = makeRequest({
      originalUrl: '/api/hello?id=1%20OR%201=1',
      query: { id: '1 OR 1=1' },
    });

    const result = await service.handle(req);

    expect(result.status).toBe(403);
    expect(forwardMock).not.toHaveBeenCalled();

    await new Promise((resolve) => process.nextTick(resolve));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to record traffic metrics'),
    );
  });
});
