import { PrismaService } from '../../database/prisma.service';
import { TrafficMetricRepository } from './traffic-metric.repository';

describe('TrafficMetricRepository', () => {
  describe('getTotals', () => {
    it('returns the summed totals from the aggregate query', async () => {
      const aggregate = jest.fn().mockResolvedValue({
        _sum: {
          totalRequests: 6,
          allowedRequests: 3,
          blockedRequests: 3,
          sqlInjectionBlocks: 2,
          xssBlocks: 1,
        },
      });
      const prisma = {
        trafficMetric: { aggregate },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      const result = await repository.getTotals();

      expect(result).toEqual({
        totalRequests: 6,
        allowedRequests: 3,
        blockedRequests: 3,
        sqlInjectionBlocks: 2,
        xssBlocks: 1,
      });
      expect(aggregate).toHaveBeenCalledWith({
        _sum: {
          totalRequests: true,
          allowedRequests: true,
          blockedRequests: true,
          sqlInjectionBlocks: true,
          xssBlocks: true,
        },
      });
    });

    it('coalesces null sums (no rows yet) to 0', async () => {
      const aggregate = jest.fn().mockResolvedValue({
        _sum: {
          totalRequests: null,
          allowedRequests: null,
          blockedRequests: null,
          sqlInjectionBlocks: null,
          xssBlocks: null,
        },
      });
      const prisma = {
        trafficMetric: { aggregate },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      const result = await repository.getTotals();

      expect(result).toEqual({
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
        sqlInjectionBlocks: 0,
        xssBlocks: 0,
      });
    });

    it('propagates a repository failure (caller decides how to handle it)', async () => {
      const aggregate = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const prisma = {
        trafficMetric: { aggregate },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      await expect(repository.getTotals()).rejects.toThrow('ECONNREFUSED');
    });

    it('adds a bucketStart where clause when a range is given, and omits it entirely otherwise', async () => {
      const aggregate = jest.fn().mockResolvedValue({
        _sum: {
          totalRequests: null,
          allowedRequests: null,
          blockedRequests: null,
          sqlInjectionBlocks: null,
          xssBlocks: null,
        },
      });
      const prisma = {
        trafficMetric: { aggregate },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      const from = new Date('2026-08-25T00:00:00.000Z');
      const to = new Date('2026-08-31T16:08:32.000Z');
      await repository.getTotals({ from, to });
      expect(aggregate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { bucketStart: { gte: from, lte: to } },
        }),
      );

      await repository.getTotals();
      const lastCallArgs = aggregate.mock.calls[
        aggregate.mock.calls.length - 1
      ] as [Record<string, unknown>];
      expect(lastCallArgs[0]).not.toHaveProperty('where');
    });
  });

  describe('getDailyTrend', () => {
    it('fetches buckets in range ordered ascending and groups them by day', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'b1',
          bucketStart: new Date('2026-08-25T09:00:00.000Z'),
          totalRequests: 3,
          allowedRequests: 2,
          blockedRequests: 1,
          sqlInjectionBlocks: 1,
          xssBlocks: 0,
        },
      ]);
      const prisma = {
        trafficMetric: { findMany },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      const from = new Date('2026-08-25T00:00:00.000Z');
      const to = new Date('2026-08-25T23:00:00.000Z');
      const result = await repository.getDailyTrend({ from, to });

      expect(findMany).toHaveBeenCalledWith({
        where: { bucketStart: { gte: from, lte: to } },
        orderBy: { bucketStart: 'asc' },
      });
      expect(result).toEqual([
        {
          date: '2026-08-25',
          totalRequests: 3,
          allowedRequests: 2,
          blockedRequests: 1,
        },
      ]);
    });
  });

  describe('getCurrentHourTotal', () => {
    it('returns the current hour bucket totalRequests', async () => {
      const findUnique = jest.fn().mockResolvedValue({ totalRequests: 7 });
      const prisma = {
        trafficMetric: { findUnique },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      await expect(repository.getCurrentHourTotal()).resolves.toBe(7);
      expect(findUnique).toHaveBeenCalledTimes(1);
      const [callArg] = findUnique.mock.calls[0] as [
        { where: { bucketStart: Date } },
      ];
      expect(callArg.where.bucketStart).toBeInstanceOf(Date);
    });

    it('returns 0 when no bucket exists yet for the current hour', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const prisma = {
        trafficMetric: { findUnique },
      } as unknown as PrismaService;
      const repository = new TrafficMetricRepository(prisma);

      await expect(repository.getCurrentHourTotal()).resolves.toBe(0);
    });
  });
});
