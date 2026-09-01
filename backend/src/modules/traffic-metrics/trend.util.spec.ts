import { TrafficMetric } from '@prisma/client';
import { groupBucketsByDay } from './trend.util';

function makeBucket(overrides: Partial<TrafficMetric> = {}): TrafficMetric {
  return {
    id: 'bucket-1',
    bucketStart: new Date('2026-08-25T00:00:00.000Z'),
    totalRequests: 0,
    allowedRequests: 0,
    blockedRequests: 0,
    sqlInjectionBlocks: 0,
    xssBlocks: 0,
    ...overrides,
  };
}

describe('groupBucketsByDay', () => {
  it('zero-fills every day in range when no buckets fall on it', () => {
    const from = new Date('2026-08-25T00:00:00.000Z');
    const to = new Date('2026-08-27T12:00:00.000Z');

    expect(groupBucketsByDay([], from, to)).toEqual([
      {
        date: '2026-08-25',
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
      },
      {
        date: '2026-08-26',
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
      },
      {
        date: '2026-08-27',
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
      },
    ]);
  });

  it('sums multiple same-day buckets (different hours) into one row', () => {
    const from = new Date('2026-08-25T00:00:00.000Z');
    const to = new Date('2026-08-25T23:00:00.000Z');
    const buckets = [
      makeBucket({
        bucketStart: new Date('2026-08-25T09:00:00.000Z'),
        totalRequests: 3,
        allowedRequests: 2,
        blockedRequests: 1,
      }),
      makeBucket({
        bucketStart: new Date('2026-08-25T14:00:00.000Z'),
        totalRequests: 5,
        allowedRequests: 1,
        blockedRequests: 4,
      }),
    ];

    expect(groupBucketsByDay(buckets, from, to)).toEqual([
      {
        date: '2026-08-25',
        totalRequests: 8,
        allowedRequests: 3,
        blockedRequests: 5,
      },
    ]);
  });

  it('ignores a bucket outside the [from, to] range', () => {
    const from = new Date('2026-08-25T00:00:00.000Z');
    const to = new Date('2026-08-25T23:00:00.000Z');
    const buckets = [
      makeBucket({
        bucketStart: new Date('2026-09-01T00:00:00.000Z'),
        totalRequests: 99,
      }),
    ];

    expect(groupBucketsByDay(buckets, from, to)).toEqual([
      {
        date: '2026-08-25',
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
      },
    ]);
  });
});
