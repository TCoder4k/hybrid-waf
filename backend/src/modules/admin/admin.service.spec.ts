import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SecurityEvent } from '@prisma/client';
import { SecurityEventRepository } from '../security-events/security-event.repository';
import { TrafficMetricRepository } from '../traffic-metrics/traffic-metric.repository';
import { AdminService } from './admin.service';

function makeTrafficMetricRepository(
  getTotals: jest.Mock = jest.fn(),
): TrafficMetricRepository {
  return { getTotals } as unknown as TrafficMetricRepository;
}

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

describe('AdminService', () => {
  it('returns the paginated list from the repository', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue({ items: [makeEvent()], total: 1 });
    const repository = { findMany } as unknown as SecurityEventRepository;
    const service = new AdminService(repository, makeTrafficMetricRepository());

    const result = await service.listEvents({ page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [makeEvent()], total: 1 });
    expect(findMany).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('wraps a repository failure from listEvents as ServiceUnavailableException', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const repository = { findMany } as unknown as SecurityEventRepository;
    const service = new AdminService(repository, makeTrafficMetricRepository());

    await expect(service.listEvents({ page: 1, pageSize: 20 })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns a single event by id', async () => {
    const findById = jest.fn().mockResolvedValue(makeEvent());
    const repository = { findById } as unknown as SecurityEventRepository;
    const service = new AdminService(repository, makeTrafficMetricRepository());

    const result = await service.getEvent('event-1');

    expect(result).toEqual(makeEvent());
  });

  it('throws NotFoundException when the event does not exist', async () => {
    const findById = jest.fn().mockResolvedValue(null);
    const repository = { findById } as unknown as SecurityEventRepository;
    const service = new AdminService(repository, makeTrafficMetricRepository());

    await expect(service.getEvent('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('wraps a repository failure from getEvent as ServiceUnavailableException', async () => {
    const findById = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const repository = { findById } as unknown as SecurityEventRepository;
    const service = new AdminService(repository, makeTrafficMetricRepository());

    await expect(service.getEvent('event-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  describe('getStats', () => {
    it('returns the aggregate totals from TrafficMetricRepository', async () => {
      const totals = {
        totalRequests: 6,
        allowedRequests: 3,
        blockedRequests: 3,
        sqlInjectionBlocks: 2,
        xssBlocks: 1,
      };
      const getTotals = jest.fn().mockResolvedValue(totals);
      const service = new AdminService(
        {} as SecurityEventRepository,
        makeTrafficMetricRepository(getTotals),
      );

      await expect(service.getStats()).resolves.toEqual(totals);
    });

    it('wraps a repository failure from getStats as ServiceUnavailableException', async () => {
      const getTotals = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new AdminService(
        {} as SecurityEventRepository,
        makeTrafficMetricRepository(getTotals),
      );

      await expect(service.getStats()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
