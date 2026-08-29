import { BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

function makeController(
  listEvents: jest.Mock = jest.fn(),
  getEvent: jest.Mock = jest.fn(),
  getStats: jest.Mock = jest.fn(),
) {
  const adminService = {
    listEvents,
    getEvent,
    getStats,
  } as unknown as AdminService;
  return new AdminController(adminService);
}

describe('AdminController', () => {
  describe('listEvents', () => {
    it('defaults to page 1, pageSize 20 with no filters', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController(listEvents);

      void controller.listEvents({});

      expect(listEvents).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        attackType: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('parses page, pageSize, attackType, from, and to', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController(listEvents);

      void controller.listEvents({
        page: '2',
        pageSize: '10',
        attackType: 'XSS',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
      });

      expect(listEvents).toHaveBeenCalledWith({
        page: 2,
        pageSize: 10,
        attackType: 'XSS',
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-01-31T00:00:00.000Z'),
      });
    });

    it('caps pageSize at 100', () => {
      const listEvents = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = makeController(listEvents);

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
      const controller = makeController(jest.fn(), getEvent);

      const result = await controller.getEvent('event-1');

      expect(getEvent).toHaveBeenCalledWith('event-1');
      expect(result).toEqual({ id: 'event-1' });
    });
  });

  describe('getStats', () => {
    it('delegates to AdminService.getStats', async () => {
      const totals = {
        totalRequests: 6,
        allowedRequests: 3,
        blockedRequests: 3,
        sqlInjectionBlocks: 2,
        xssBlocks: 1,
      };
      const getStats = jest.fn().mockResolvedValue(totals);
      const controller = makeController(jest.fn(), jest.fn(), getStats);

      const result = await controller.getStats();

      expect(getStats).toHaveBeenCalledWith();
      expect(result).toEqual(totals);
    });
  });
});
