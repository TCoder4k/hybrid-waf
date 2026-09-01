import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { daysToRange } from '../../common/date-range.util';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SecurityEventListFilter } from '../security-events/security-event.repository';
import { TrendPoint } from '../traffic-metrics/trend.util';
import { TrafficMetricTotals } from '../traffic-metrics/traffic-metric.repository';
import {
  AdminSecurityEvent,
  AdminSecurityEventListResult,
} from './admin-event.dto';
import { AdminService } from './admin.service';
import type { AdminStatsExtra } from './admin.service';
import { buildSystemInfo } from './system-info';
import type { SystemInfo } from './system-info';
import { SystemStatusService } from './system-status.service';
import type { SystemStatus } from './system-status.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_TREND_DAYS = 90;
const DEFAULT_TREND_DAYS = 7;
const ALLOWED_ATTACK_TYPES = new Set(['SQL_INJECTION', 'XSS']);

// Every route here requires a valid JWT (docs/architecture.md §11/§13) —
// this is the only module gated by JwtAuthGuard.
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly systemStatusService: SystemStatusService,
  ) {}

  @Get('events')
  listEvents(
    @Query() query: Record<string, string>,
  ): Promise<AdminSecurityEventListResult> {
    return this.adminService.listEvents(parseListFilter(query));
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string): Promise<AdminSecurityEvent> {
    return this.adminService.getEvent(id);
  }

  // Aggregate traffic totals for the Dashboard (Phase 10; `days` added by
  // the Dashboard UI redesign task). Reads TrafficMetric only (ADR-7) —
  // "Recent Security Events" on the Dashboard is served by GET /admin/events
  // instead, not duplicated here. `days` omitted -> all-time totals,
  // unchanged from Phase 10's original behavior.
  @Get('stats')
  getStats(@Query('days') days?: string): Promise<TrafficMetricTotals> {
    return this.adminService.getStats(parseDays(days));
  }

  // Daily-bucketed totals for the Request Trend chart.
  @Get('stats/trend')
  getTrend(@Query('days') days?: string): Promise<TrendPoint[]> {
    return this.adminService.getTrend(
      parseDaysOrDefault(days, DEFAULT_TREND_DAYS),
    );
  }

  // Malicious-IP / country / current-hour-throughput numbers for the Quick
  // Stats panel — kept separate from `stats` so that endpoint's documented
  // "TrafficMetric only" contract stays true.
  @Get('stats/extra')
  getStatsExtra(@Query('days') days?: string): Promise<AdminStatsExtra> {
    return this.adminService.getStatsExtra(parseDays(days));
  }

  // Live up/down status of every WAF component, for the System Status
  // panel. Never 503s — "down" is itself a valid 200 answer here, so this
  // bypasses AdminService's usual DB-failure-to-503 wrapping and talks to
  // SystemStatusService directly.
  @Get('system-status')
  getSystemStatus(): Promise<SystemStatus> {
    return this.systemStatusService.getStatus();
  }

  // Static + runtime process info for the System Info panel. No DB
  // involved at all, so this never fails.
  @Get('system-info')
  getSystemInfo(): SystemInfo {
    return buildSystemInfo();
  }

  // "Who am I" for the Header's username display — decoded straight from
  // the already-verified JWT the guard attached to the request, no new DB
  // read, stays stateless per ADR-5.
  @Get('me')
  getMe(@Req() req: Request & { admin?: JwtPayload }): { username: string } {
    return { username: req.admin?.username ?? '' };
  }
}

function parseListFilter(
  query: Record<string, string>,
): SecurityEventListFilter {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  let attackType: string | undefined;
  if (query.attackType !== undefined) {
    if (!ALLOWED_ATTACK_TYPES.has(query.attackType)) {
      throw new BadRequestException(
        `attackType must be one of: ${[...ALLOWED_ATTACK_TYPES].join(', ')}`,
      );
    }
    attackType = query.attackType;
  }

  const method = query.method ? query.method.toUpperCase() : undefined;
  const search = query.search?.trim() ? query.search.trim() : undefined;
  const minConfidence = parseMinConfidence(query.minConfidence);

  // `days` is sugar for `from`/`to` (mirrors the other range-aware
  // endpoints' `?days=`) — when given, it wins over any explicit from/to.
  let from = parseOptionalDate(query.from, 'from');
  let to = parseOptionalDate(query.to, 'to');
  if (query.days !== undefined) {
    const range = daysToRange(parseDaysBounded(query.days, 'days'));
    from = range.from;
    to = range.to;
  }

  return {
    page,
    pageSize,
    attackType,
    method,
    search,
    minConfidence,
    from,
    to,
  };
}

function parseMinConfidence(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new BadRequestException(
      'minConfidence must be a number between 0 and 1',
    );
  }
  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      'page and pageSize must be positive integers',
    );
  }
  return parsed;
}

function parseOptionalDate(
  value: string | undefined,
  paramName: string,
): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${paramName} must be a valid ISO date`);
  }
  return date;
}

function parseDaysBounded(value: string, paramName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TREND_DAYS) {
    throw new BadRequestException(
      `${paramName} must be a positive integer between 1 and ${MAX_TREND_DAYS}`,
    );
  }
  return parsed;
}

function parseDays(value: string | undefined): number | undefined {
  return value === undefined ? undefined : parseDaysBounded(value, 'days');
}

function parseDaysOrDefault(
  value: string | undefined,
  fallback: number,
): number {
  return value === undefined ? fallback : parseDaysBounded(value, 'days');
}
