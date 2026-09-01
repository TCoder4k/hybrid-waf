import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DateRange } from '../../common/date-range.util';
import { PrismaService } from '../../database/prisma.service';
import { truncateToHour } from './bucket.util';
import { groupBucketsByDay, TrendPoint } from './trend.util';

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

  // Read side for GET /admin/stats (Phase 10, extended for the Dashboard UI
  // redesign task with an optional `range`) — an all-time sum across every
  // bucket when `range` is omitted, exactly as before (byte-identical query,
  // so every existing caller is unaffected), or a sum restricted to
  // `bucketStart BETWEEN range.from AND range.to` when a date-range selector
  // is in play. The table is small (one row per UTC hour, no retention
  // policy yet per docs/architecture.md §12), so summing is cheap either
  // way. `_sum` fields come back `null` when no rows match (fresh DB, or a
  // range with no traffic) — coalesced to 0 rather than leaking `null` into
  // the API response.
  async getTotals(range?: DateRange): Promise<TrafficMetricTotals> {
    const result = await this.prisma.trafficMetric.aggregate({
      _sum: {
        totalRequests: true,
        allowedRequests: true,
        blockedRequests: true,
        sqlInjectionBlocks: true,
        xssBlocks: true,
      },
      ...(range
        ? { where: { bucketStart: { gte: range.from, lte: range.to } } }
        : {}),
    });

    return {
      totalRequests: result._sum.totalRequests ?? 0,
      allowedRequests: result._sum.allowedRequests ?? 0,
      blockedRequests: result._sum.blockedRequests ?? 0,
      sqlInjectionBlocks: result._sum.sqlInjectionBlocks ?? 0,
      xssBlocks: result._sum.xssBlocks ?? 0,
    };
  }

  // Daily-bucketed totals for the Request Trend chart — fetches every
  // hourly bucket in range (at most days*24 rows, trivial) and sums them
  // per calendar day in application code (see trend.util.ts for why).
  async getDailyTrend(range: DateRange): Promise<TrendPoint[]> {
    const buckets = await this.prisma.trafficMetric.findMany({
      where: { bucketStart: { gte: range.from, lte: range.to } },
      orderBy: { bucketStart: 'asc' },
    });
    return groupBucketsByDay(buckets, range.from, range.to);
  }

  // The current UTC hour's total — "current throughput" for the Quick
  // Stats panel's "Requests/giờ", not a range average. 0 when no bucket
  // exists yet for this hour (e.g. right after a fresh deploy).
  async getCurrentHourTotal(): Promise<number> {
    const row = await this.prisma.trafficMetric.findUnique({
      where: { bucketStart: truncateToHour(new Date()) },
    });
    return row?.totalRequests ?? 0;
  }
}
