import type { Request } from 'express';
import { RequestNormalizerService } from '../request/request-normalizer.service';
import { SecurityEventLogger } from '../security-events/security-event-logger.service';
import { TrafficMetricsRecorder } from '../traffic-metrics/traffic-metrics.recorder';
import { RateLimitRecorder } from './rate-limit-recorder.service';

function makeRequest(): Request {
  return {
    method: 'GET',
    originalUrl: '/api/hello',
    headers: {},
    query: {},
    params: {},
    body: undefined,
    ip: '203.0.113.9',
  } as unknown as Request;
}

describe('RateLimitRecorder', () => {
  it('records both traffic metrics and a SecurityEvent for a rate-limit block, without awaiting either', () => {
    const normalizer = new RequestNormalizerService();
    const trafficMetricsRecord = jest.fn().mockResolvedValue(undefined);
    const trafficMetricsRecorder = {
      record: trafficMetricsRecord,
    } as unknown as TrafficMetricsRecorder;
    const logBlock = jest.fn().mockResolvedValue(undefined);
    const securityEventLogger = {
      logBlock,
    } as unknown as SecurityEventLogger;

    const recorder = new RateLimitRecorder(
      normalizer,
      securityEventLogger,
      trafficMetricsRecorder,
    );

    // Synchronous return proves this doesn't make the caller (the guard,
    // in the hot 429 path) wait on either write.
    const result = recorder.recordBlock(
      makeRequest(),
      'rate limit exceeded for 203.0.113.9',
    );
    expect(result).toBeUndefined();

    expect(trafficMetricsRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'RATE_LIMIT',
        action: 'BLOCK',
      }),
    );
    expect(logBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIp: '203.0.113.9',
        endpoint: '/api/hello',
      }),
      expect.objectContaining({ classification: 'RATE_LIMIT', detected: true }),
      expect.objectContaining({ status: 'UNAVAILABLE' }),
      expect.objectContaining({
        classification: 'RATE_LIMIT',
        action: 'BLOCK',
      }),
    );
  });

  it('logs but does not throw when the traffic-metrics write rejects', async () => {
    const normalizer = new RequestNormalizerService();
    const trafficMetricsRecorder = {
      record: jest.fn().mockRejectedValue(new Error('metrics DB down')),
    } as unknown as TrafficMetricsRecorder;
    const securityEventLogger = {
      logBlock: jest.fn().mockResolvedValue(undefined),
    } as unknown as SecurityEventLogger;

    const recorder = new RateLimitRecorder(
      normalizer,
      securityEventLogger,
      trafficMetricsRecorder,
    );

    expect(() => recorder.recordBlock(makeRequest(), 'exceeded')).not.toThrow();
    // Let the fire-and-forgotten rejection settle so it doesn't leak into
    // the next test as an unhandled rejection.
    await new Promise((resolve) => process.nextTick(resolve));
  });
});
