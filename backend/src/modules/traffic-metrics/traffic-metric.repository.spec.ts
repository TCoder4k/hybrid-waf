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
  });
});
