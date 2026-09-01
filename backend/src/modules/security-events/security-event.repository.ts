import { Injectable } from '@nestjs/common';
import { Prisma, SecurityEvent } from '@prisma/client';
import { DateRange } from '../../common/date-range.util';
import { PrismaService } from '../../database/prisma.service';

export interface SecurityEventListFilter {
  page: number;
  pageSize: number;
  attackType?: string;
  method?: string;
  // Free-text match against endpoint OR sourceIp (case-insensitive
  // "contains"). Not user-agent — requestMeta never stores one (ADR-4
  // redaction excludes headers entirely), so there is nothing there to
  // search.
  search?: string;
  minConfidence?: number;
  from?: Date;
  to?: Date;
}

export interface SecurityEventListResult {
  items: SecurityEvent[];
  total: number;
}

// Persistence primitives only — see docs/architecture.md §10 for when a
// SecurityEvent is created (Phase 8), and §11 for the paginated/filterable
// list the Admin API (Phase 9) reads it back through.
@Injectable()
export class SecurityEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SecurityEventCreateInput): Promise<SecurityEvent> {
    return this.prisma.securityEvent.create({ data });
  }

  findById(id: string): Promise<SecurityEvent | null> {
    return this.prisma.securityEvent.findUnique({ where: { id } });
  }

  async findMany(
    filter: SecurityEventListFilter,
  ): Promise<SecurityEventListResult> {
    const where: Prisma.SecurityEventWhereInput = {
      ...(filter.attackType ? { attackType: filter.attackType } : {}),
      ...(filter.method ? { method: filter.method } : {}),
      ...(filter.minConfidence !== undefined
        ? { confidence: { gte: filter.minConfidence } }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { endpoint: { contains: filter.search, mode: 'insensitive' } },
              { sourceIp: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.from || filter.to
        ? {
            timestamp: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.securityEvent.count({ where }),
    ]);

    return { items, total };
  }

  // Distinct source IPs behind BLOCK events, optionally restricted to a
  // date range — feeds GET /admin/stats/extra's "malicious IP" and
  // "country" counts. Every SecurityEvent row is already an attacker
  // (ADR-3: BLOCK-only), so no extra filtering is needed beyond the range.
  async findDistinctSourceIps(range?: DateRange): Promise<string[]> {
    const where: Prisma.SecurityEventWhereInput = range
      ? { timestamp: { gte: range.from, lte: range.to } }
      : {};

    const rows = await this.prisma.securityEvent.findMany({
      where,
      distinct: ['sourceIp'],
      select: { sourceIp: true },
    });
    return rows.map((row) => row.sourceIp);
  }
}
