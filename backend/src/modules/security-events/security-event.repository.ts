import { Injectable } from '@nestjs/common';
import { Prisma, SecurityEvent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface SecurityEventListFilter {
  page: number;
  pageSize: number;
  attackType?: string;
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
}
