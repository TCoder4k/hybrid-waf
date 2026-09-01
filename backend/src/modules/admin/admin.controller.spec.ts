import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemStatusService } from './system-status.service';

function makeController(
  overrides: {
    listEvents?: jest.Mock;
    getEvent?: jest.Mock;
    getStats?: jest.Mock;
    getTrend?: jest.Mock;
    getStatsExtra?: jest.Mock;
    getSystemStatus?: jest.Mock;
  } = {},
) {
  const adminService = {
    listEvents: jest.fn(),
    getEvent: jest.fn(),
    getStats: jest.fn(),
    getTrend: jest.fn(),
    getStatsExtra: jest.fn(),
    ...overrides,
  } as unknown as AdminService;
  const systemStatusService = {
    getStatus: overrides.getSystemStatus ?? jest.fn(),
  } as unknown as SystemStatusService;
  return new AdminController(adminService, systemStatusService);
}

describe('AdminController', () => {
  describe('listEvents', () => {
    it('defaults to page 1, pageSize 20 with no filters', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController({ listEvents });

      void controller.listEvents({});

      expect(listEvents).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        attackType: undefined,
        method: undefined,
        search: undefined,
        minConfidence: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('parses page, pageSize, attackType, from, and to', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController({ listEvents });

      void controller.listEvents({
        page: '2',
        pageSize: '10',
        attackType: 'XSS',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
      });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          attackType: 'XSS',
          from: new Date('2026-01-01T00:00:00.000Z'),
          to: new Date('2026-01-31T00:00:00.000Z'),
        }),
      );
    });

    it('parses method, search, and minConfidence', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController({ listEvents });

      void controller.listEvents({
        method: 'post',
        search: '  /api/login  ',
        minConfidence: '0.5',
      });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          search: '/api/login',
          minConfidence: 0.5,
        }),
      );
    });

    it('rejects a minConfidence outside 0-1', () => {
      const controller = makeController();
      expect(() => controller.listEvents({ minConfidence: '1.5' })).toThrow(
        BadRequestException,
      );
      expect(() => controller.listEvents({ minConfidence: 'abc' })).toThrow(
        BadRequestException,
      );
    });

    it('resolves "days" into a from/to range, overriding explicit from/to', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController({ listEvents });

      void controller.listEvents({
        days: '7',
        from: '2020-01-01T00:00:00.000Z',
      });

      const [call] = listEvents.mock.calls[0] as [{ from: Date; to: Date }];
      expect(call.from).toBeInstanceOf(Date);
      expect(call.to).toBeInstanceOf(Date);
      expect(call.from.getTime()).not.toBe(
        new Date('2020-01-01T00:00:00.000Z').getTime(),
      );
    });

    it('rejects a "days" value above the 90-day cap', () => {
      const controller = makeController();
      expect(() => controller.listEvents({ days: '91' })).toThrow(
        BadRequestException,
      );
    });

    it('caps pageSize at 100', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController({ listEvents });

      void controller.listEvents({ pageSize: '500' });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100 }),
      );
    });

    it('rejects a non-positive page', () => {
      const controller = makeController();
      expect(() => controller.listEvents({ page: '0' })).toThrow(
        BadRequestException,
      );
    });

    it('rejects an attackType outside SQL_INJECTION/XSS', () => {
      const controller = makeController();
      expect(() => controller.listEvents({ attackType: 'NORMAL' })).toThrow(
        BadRequestException,
      );
    });

    it('rejects an invalid "from" date', () => {
      const controller = makeController();
      expect(() => controller.listEvents({ from: 'not-a-date' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getEvent', () => {
    it('delegates to AdminService.getEvent', async () => {
      const getEvent = jest.fn().mockResolvedValue({ id: 'event-1' });
      const controller = makeController({ getEvent });

      const result = await controller.getEvent('event-1');

      expect(getEvent).toHaveBeenCalledWith('event-1');
      expect(result).toEqual({ id: 'event-1' });
    });
  });

  describe('getStats', () => {
    const totals = {
      totalRequests: 6,
      allowedRequests: 3,
      blockedRequests: 3,
      sqlInjectionBlocks: 2,
      xssBlocks: 1,
    };

    it('delegates to AdminService.getStats with days=undefined when omitted', async () => {
      const getStats = jest.fn().mockResolvedValue(totals);
      const controller = makeController({ getStats });

      const result = await controller.getStats();

      expect(getStats).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(totals);
    });

    it('parses a valid days value', async () => {
      const getStats = jest.fn().mockResolvedValue(totals);
      const controller = makeController({ getStats });

      await controller.getStats('7');

      expect(getStats).toHaveBeenCalledWith(7);
    });

    it('rejects a non-integer days value', () => {
      const controller = makeController();
      expect(() => controller.getStats('abc')).toThrow(BadRequestException);
    });

    it('rejects a days value above the 90-day cap', () => {
      const controller = makeController();
      expect(() => controller.getStats('91')).toThrow(BadRequestException);
    });

    it('rejects a days value below 1', () => {
      const controller = makeController();
      expect(() => controller.getStats('0')).toThrow(BadRequestException);
    });
  });

  describe('getTrend', () => {
    it('defaults to 7 days when omitted', async () => {
      const getTrend = jest.fn().mockResolvedValue([]);
      const controller = makeController({ getTrend });

      await controller.getTrend();

      expect(getTrend).toHaveBeenCalledWith(7);
    });

    it('parses a valid days value', async () => {
      const getTrend = jest.fn().mockResolvedValue([]);
      const controller = makeController({ getTrend });

      await controller.getTrend('30');

      expect(getTrend).toHaveBeenCalledWith(30);
    });

    it('rejects an invalid days value', () => {
      const controller = makeController();
      expect(() => controller.getTrend('abc')).toThrow(BadRequestException);
    });
  });

  describe('getStatsExtra', () => {
    it('delegates to AdminService.getStatsExtra with days=undefined when omitted', async () => {
      const extra = {
        maliciousIpCount: 1,
        countryCount: 1,
        requestsThisHour: 2,
      };
      const getStatsExtra = jest.fn().mockResolvedValue(extra);
      const controller = makeController({ getStatsExtra });

      const result = await controller.getStatsExtra();

      expect(getStatsExtra).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(extra);
    });
  });

  describe('getSystemStatus', () => {
    it('delegates to SystemStatusService.getStatus', async () => {
      const status = {
        wafEngine: 'up' as const,
        mlService: 'up' as const,
        database: 'up' as const,
        protectedApi: 'up' as const,
      };
      const getSystemStatus = jest.fn().mockResolvedValue(status);
      const controller = makeController({ getSystemStatus });

      await expect(controller.getSystemStatus()).resolves.toEqual(status);
    });
  });

  describe('getSystemInfo', () => {
    it('returns a system info object', () => {
      const controller = makeController();
      const info = controller.getSystemInfo();

      expect(typeof info.version).toBe('string');
      expect(typeof info.uptimeSeconds).toBe('number');
    });
  });

  describe('getMe', () => {
    it('returns the username from the guard-attached JWT payload', () => {
      const controller = makeController();
      const req = {
        admin: { sub: 'admin-1', username: 'alice' },
      } as unknown as Request & { admin?: JwtPayload };

      expect(controller.getMe(req)).toEqual({ username: 'alice' });
    });

    it('returns an empty username if the guard did not attach one (defensive)', () => {
      const controller = makeController();
      const req = {} as unknown as Request & { admin?: JwtPayload };

      expect(controller.getMe(req)).toEqual({ username: '' });
    });
  });
});
