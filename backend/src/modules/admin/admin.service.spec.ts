import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SecurityEvent } from '@prisma/client';
import { SecurityEventRepository } from '../security-events/security-event.repository';
import { TrafficMetricRepository } from '../traffic-metrics/traffic-metric.repository';
import { AdminService } from './admin.service';

function makeTrafficMetricRepository(
  overrides: Partial<{
    getTotals: jest.Mock;
    getDailyTrend: jest.Mock;
    getCurrentHourTotal: jest.Mock;
  }> = {},
): TrafficMetricRepository {
  return {
    getTotals: jest.fn(),
    getDailyTrend: jest.fn(),
    getCurrentHourTotal: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as TrafficMetricRepository;
}

function makeSecurityEventRepository(
  overrides: Partial<{
    findMany: jest.Mock;
    findById: jest.Mock;
    findDistinctSourceIps: jest.Mock;
  }> = {},
): SecurityEventRepository {
  return {
    findMany: jest.fn(),
    findById: jest.fn(),
    findDistinctSourceIps: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as SecurityEventRepository;
}

function makeEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'event-1',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    sourceIp: '203.0.113.9', // documentation range — geoip-lite resolves it to null
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
  it('returns the paginated list from the repository, enriched with country', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue({ items: [makeEvent()], total: 1 });
    const repository = makeSecurityEventRepository({ findMany });
    const service = new AdminService(repository, makeTrafficMetricRepository());

    const result = await service.listEvents({ page: 1, pageSize: 20 });

    expect(result).toEqual({
      items: [{ ...makeEvent(), country: null, countryCode: null }],
      total: 1,
    });
    expect(findMany).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('wraps a repository failure from listEvents as ServiceUnavailableException', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const repository = makeSecurityEventRepository({ findMany });
    const service = new AdminService(repository, makeTrafficMetricRepository());

    await expect(service.listEvents({ page: 1, pageSize: 20 })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns a single event by id, enriched with country', async () => {
    const findById = jest.fn().mockResolvedValue(makeEvent());
    const repository = makeSecurityEventRepository({ findById });
    const service = new AdminService(repository, makeTrafficMetricRepository());

    const result = await service.getEvent('event-1');

    expect(result).toEqual({
      ...makeEvent(),
      country: null,
      countryCode: null,
    });
  });

  it('throws NotFoundException when the event does not exist', async () => {
    const findById = jest.fn().mockResolvedValue(null);
    const repository = makeSecurityEventRepository({ findById });
    const service = new AdminService(repository, makeTrafficMetricRepository());

    await expect(service.getEvent('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('wraps a repository failure from getEvent as ServiceUnavailableException', async () => {
    const findById = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const repository = makeSecurityEventRepository({ findById });
    const service = new AdminService(repository, makeTrafficMetricRepository());

    await expect(service.getEvent('event-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  describe('getStats', () => {
    const totals = {
      totalRequests: 6,
      allowedRequests: 3,
      blockedRequests: 3,
      sqlInjectionBlocks: 2,
      xssBlocks: 1,
    };

    it('returns all-time totals (no range) when days is omitted', async () => {
      const getTotals = jest.fn().mockResolvedValue(totals);
      const service = new AdminService(
        makeSecurityEventRepository(),
        makeTrafficMetricRepository({ getTotals }),
      );

      await expect(service.getStats()).resolves.toEqual(totals);
      expect(getTotals).toHaveBeenCalledWith(undefined);
    });

    it('converts days into a date range and passes it through', async () => {
      const getTotals = jest.fn().mockResolvedValue(totals);
      const service = new AdminService(
        makeSecurityEventRepository(),
        makeTrafficMetricRepository({ getTotals }),
      );

      await service.getStats(7);

      expect(getTotals).toHaveBeenCalledTimes(1);
      const [range] = getTotals.mock.calls[0] as [{ from: Date; to: Date }];
      expect(range.from).toBeInstanceOf(Date);
      expect(range.to).toBeInstanceOf(Date);
    });

    it('wraps a repository failure from getStats as ServiceUnavailableException', async () => {
      const getTotals = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new AdminService(
        makeSecurityEventRepository(),
        makeTrafficMetricRepository({ getTotals }),
      );

      await expect(service.getStats()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getTrend', () => {
    it('delegates to getDailyTrend with a days-derived range', async () => {
      const trend = [
        {
          date: '2026-08-25',
          totalRequests: 1,
          allowedRequests: 1,
          blockedRequests: 0,
        },
      ];
      const getDailyTrend = jest.fn().mockResolvedValue(trend);
      const service = new AdminService(
        makeSecurityEventRepository(),
        makeTrafficMetricRepository({ getDailyTrend }),
      );

      await expect(service.getTrend(7)).resolves.toEqual(trend);
      expect(getDailyTrend).toHaveBeenCalledTimes(1);
      const [range] = getDailyTrend.mock.calls[0] as [{ from: Date; to: Date }];
      expect(range.from).toBeInstanceOf(Date);
      expect(range.to).toBeInstanceOf(Date);
    });

    it('wraps a repository failure as ServiceUnavailableException', async () => {
      const getDailyTrend = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new AdminService(
        makeSecurityEventRepository(),
        makeTrafficMetricRepository({ getDailyTrend }),
      );

      await expect(service.getTrend(7)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getStatsExtra', () => {
    it('counts distinct IPs and countries, and reports the current-hour total', async () => {
      const findDistinctSourceIps = jest
        .fn()
        .mockResolvedValue(['8.8.8.8', '1.0.0.1', '203.0.113.9']);
      const getCurrentHourTotal = jest.fn().mockResolvedValue(4);
      const service = new AdminService(
        makeSecurityEventRepository({ findDistinctSourceIps }),
        makeTrafficMetricRepository({ getCurrentHourTotal }),
      );

      const result = await service.getStatsExtra();

      expect(result.maliciousIpCount).toBe(3);
      // 8.8.8.8 -> US, 1.0.0.1 -> AU, 203.0.113.9 -> unresolvable (null,
      // excluded) — 2 distinct countries.
      expect(result.countryCount).toBe(2);
      expect(result.requestsThisHour).toBe(4);
    });

    it('wraps a repository failure as ServiceUnavailableException', async () => {
      const findDistinctSourceIps = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new AdminService(
        makeSecurityEventRepository({ findDistinctSourceIps }),
        makeTrafficMetricRepository(),
      );

      await expect(service.getStatsExtra()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
