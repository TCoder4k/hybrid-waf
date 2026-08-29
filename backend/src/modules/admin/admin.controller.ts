import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SecurityEvent } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SecurityEventListFilter,
  SecurityEventListResult,
} from '../security-events/security-event.repository';
import { TrafficMetricTotals } from '../traffic-metrics/traffic-metric.repository';
import { AdminService } from './admin.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ALLOWED_ATTACK_TYPES = new Set(['SQL_INJECTION', 'XSS']);

// Every route here requires a valid JWT (docs/architecture.md §11/§13) —
// this is the only module gated by JwtAuthGuard.
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('events')
  listEvents(
    @Query() query: Record<string, string>,
  ): Promise<SecurityEventListResult> {
    return this.adminService.listEvents(parseListFilter(query));
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string): Promise<SecurityEvent> {
    return this.adminService.getEvent(id);
  }

  // Aggregate traffic totals for the Dashboard (Phase 10). Reads
  // TrafficMetric only (ADR-7) — "Recent Security Events" on the Dashboard
  // is served by GET /admin/events instead, not duplicated here.
  @Get('stats')
  getStats(): Promise<TrafficMetricTotals> {
    return this.adminService.getStats();
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

  const from = parseOptionalDate(query.from, 'from');
  const to = parseOptionalDate(query.to, 'to');

  return { page, pageSize, attackType, from, to };
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
