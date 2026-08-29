import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface TrafficMetricIncrement {
  allowed: 0 | 1;
  blocked: 0 | 1;
  sqlInjectionBlocks: 0 | 1;
  xssBlocks: 0 | 1;
}

export interface TrafficMetricTotals {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  sqlInjectionBlocks: number;
  xssBlocks: number;
}

// Persistence primitive only. A single atomic `INSERT ... ON CONFLICT DO
// UPDATE` — not Prisma's `.upsert()`, which is two round-trips (try create,
// catch unique violation, then update) and is not safe against concurrent
// requests landing in the same hour bucket at once. This is race-safe under
// concurrent writers and still one DB operation per call.
@Injectable()
export class TrafficMetricRepository {
  constructor(private readonly prisma: PrismaService) {}

  async incrementBucket(
    bucketStart: Date,
    counts: TrafficMetricIncrement,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO traffic_metrics (
        id, "bucketStart", "totalRequests", "allowedRequests",
        "blockedRequests", "sqlInjectionBlocks", "xssBlocks"
      )
      VALUES (
        ${randomUUID()}, ${bucketStart}, 1, ${counts.allowed},
        ${counts.blocked}, ${counts.sqlInjectionBlocks}, ${counts.xssBlocks}
      )
      ON CONFLICT ("bucketStart") DO UPDATE SET
        "totalRequests" = traffic_metrics."totalRequests" + 1,
        "allowedRequests" = traffic_metrics."allowedRequests" + ${counts.allowed},
        "blockedRequests" = traffic_metrics."blockedRequests" + ${counts.blocked},
        "sqlInjectionBlocks" = traffic_metrics."sqlInjectionBlocks" + ${counts.sqlInjectionBlocks},
        "xssBlocks" = traffic_metrics."xssBlocks" + ${counts.xssBlocks}
    `;
  }

  // Read side for GET /admin/stats (Phase 10) — an all-time sum across every
  // bucket, not a time-windowed query. The table is small (one row per UTC
  // hour, no retention policy yet per docs/architecture.md §12), so summing
  // the whole table is cheap. `_sum` fields come back `null` when the table
  // has zero rows (fresh DB) — coalesced to 0 rather than leaking `null` into
  // the API response.
  async getTotals(): Promise<TrafficMetricTotals> {
    const result = await this.prisma.trafficMetric.aggregate({
      _sum: {
        totalRequests: true,
        allowedRequests: true,
        blockedRequests: true,
        sqlInjectionBlocks: true,
        xssBlocks: true,
      },
    });

    return {
      totalRequests: result._sum.totalRequests ?? 0,
      allowedRequests: result._sum.allowedRequests ?? 0,
      blockedRequests: result._sum.blockedRequests ?? 0,
      sqlInjectionBlocks: result._sum.sqlInjectionBlocks ?? 0,
      xssBlocks: result._sum.xssBlocks ?? 0,
    };
  }
}
