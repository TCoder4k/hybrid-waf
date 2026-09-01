import { SecurityEvent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SecurityEventRepository } from './security-event.repository';

function makeEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'event-1',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    sourceIp: '203.0.113.9',
    method: 'GET',
    endpoint: '/api/hello',
    attackType: 'SQL_INJECTION',
    ruleResult: {},
    mlResult: {},
    confidence: null,
    decision: 'BLOCK',
    requestMeta: {},
    ...overrides,
  };
}

describe('SecurityEventRepository', () => {
  describe('findMany', () => {
    it('queries with the given filter and returns items + total', async () => {
      const findMany = jest.fn().mockResolvedValue([makeEvent()]);
      const count = jest.fn().mockResolvedValue(1);
      const prisma = {
        securityEvent: { findMany, count },
      } as unknown as PrismaService;
      const repository = new SecurityEventRepository(prisma);

      const result = await repository.findMany({ page: 1, pageSize: 20 });

      expect(result).toEqual({ items: [makeEvent()], total: 1 });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { timestamp: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('builds an attackType + date-range where clause', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        securityEvent: { findMany, count },
      } as unknown as PrismaService;
      const repository = new SecurityEventRepository(prisma);

      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-01-31T00:00:00.000Z');
      await repository.findMany({
        page: 1,
        pageSize: 20,
        attackType: 'XSS',
        from,
        to,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { attackType: 'XSS', timestamp: { gte: from, lte: to } },
        }),
      );
    });

    it('builds a method + minConfidence where clause', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        securityEvent: { findMany, count },
      } as unknown as PrismaService;
      const repository = new SecurityEventRepository(prisma);

      await repository.findMany({
        page: 1,
        pageSize: 20,
        method: 'POST',
        minConfidence: 0.5,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { method: 'POST', confidence: { gte: 0.5 } },
        }),
      );
    });

    it('builds a search where clause matching endpoint OR sourceIp', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        securityEvent: { findMany, count },
      } as unknown as PrismaService;
      const repository = new SecurityEventRepository(prisma);

      await repository.findMany({ page: 1, pageSize: 20, search: '203.0' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { endpoint: { contains: '203.0', mode: 'insensitive' } },
              { sourceIp: { contains: '203.0', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('findDistinctSourceIps', () => {
    it('returns the distinct source IPs with no range', async () => {
      const findMany = jest
        .fn()
        .mockResolvedValue([
          { sourceIp: '203.0.113.9' },
          { sourceIp: '198.51.100.4' },
        ]);
      const prisma = {
        securityEvent: { findMany },
      } as unknown as PrismaService;
      const repository = new SecurityEventRepository(prisma);

      const result = await repository.findDistinctSourceIps();

      expect(result).toEqual(['203.0.113.9', '198.51.100.4']);
      expect(findMany).toHaveBeenCalledWith({
        where: {},
        distinct: ['sourceIp'],
        select: { sourceIp: true },
      });
    });

    it('restricts to a date range when given one', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        securityEvent: { findMany },
      } as unknown as PrismaService;
      const repository = new SecurityEventRepository(prisma);

      const from = new Date('2026-08-25T00:00:00.000Z');
      const to = new Date('2026-08-31T00:00:00.000Z');
      await repository.findDistinctSourceIps({ from, to });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: { gte: from, lte: to } },
        }),
      );
    });
  });
});
