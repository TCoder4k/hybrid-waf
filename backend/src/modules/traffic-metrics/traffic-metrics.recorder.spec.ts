import { DecisionResult } from '../../common/types';
import { TrafficMetricRepository } from './traffic-metric.repository';
import { TrafficMetricsRecorder } from './traffic-metrics.recorder';

function makeRecorder(
  incrementBucket: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  const repository = {
    incrementBucket,
  } as unknown as TrafficMetricRepository;
  return { recorder: new TrafficMetricsRecorder(repository), incrementBucket };
}

const allowDecision: DecisionResult = {
  classification: 'NORMAL',
  action: 'ALLOW',
  reason: 'rule: normal; ml: normal',
};

const blockSqliDecision: DecisionResult = {
  classification: 'SQL_INJECTION',
  action: 'BLOCK',
  reason: 'rule match: boolean-based tautology',
};

const blockXssDecision: DecisionResult = {
  classification: 'XSS',
  action: 'BLOCK',
  reason: 'rule match: <script> tag',
};

describe('TrafficMetricsRecorder', () => {
  it('increments only total + allowed for an ALLOW decision', async () => {
    const { recorder, incrementBucket } = makeRecorder();

    await recorder.record(allowDecision);

    expect(incrementBucket).toHaveBeenCalledWith(expect.any(Date), {
      allowed: 1,
      blocked: 0,
      sqlInjectionBlocks: 0,
      xssBlocks: 0,
    });
  });

  it('increments total + blocked + sqlInjectionBlocks for a SQL_INJECTION BLOCK', async () => {
    const { recorder, incrementBucket } = makeRecorder();

    await recorder.record(blockSqliDecision);

    expect(incrementBucket).toHaveBeenCalledWith(expect.any(Date), {
      allowed: 0,
      blocked: 1,
      sqlInjectionBlocks: 1,
      xssBlocks: 0,
    });
  });

  it('increments total + blocked + xssBlocks for an XSS BLOCK', async () => {
    const { recorder, incrementBucket } = makeRecorder();

    await recorder.record(blockXssDecision);

    expect(incrementBucket).toHaveBeenCalledWith(expect.any(Date), {
      allowed: 0,
      blocked: 1,
      sqlInjectionBlocks: 0,
      xssBlocks: 1,
    });
  });

  it('passes the current hour bucket, truncated', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T13:47:32.123Z'));
    const { recorder, incrementBucket } = makeRecorder();

    await recorder.record(allowDecision);

    const [bucketArg] = incrementBucket.mock.calls[0] as [Date, unknown];
    expect(bucketArg.toISOString()).toBe('2026-08-26T13:00:00.000Z');
    jest.useRealTimers();
  });

  it('propagates a repository failure instead of swallowing it (caller is responsible for .catch)', async () => {
    const { recorder } = makeRecorder(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    await expect(recorder.record(allowDecision)).rejects.toThrow(
      'ECONNREFUSED',
    );
  });
});
