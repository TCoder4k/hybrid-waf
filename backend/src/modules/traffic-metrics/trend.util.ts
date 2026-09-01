import { TrafficMetric } from '@prisma/client';

export interface TrendPoint {
  date: string; // YYYY-MM-DD, UTC calendar day
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
}

// One row per UTC calendar day in [from, to], inclusive — even a day with
// zero TrafficMetric buckets gets a zero-row, so GET /admin/stats/trend
// always returns a continuous N-point line for the chart, never a gap.
//
// Summed here in application code rather than via a `date_trunc` SQL query:
// at most `days * 24` rows even at the endpoint's 90-day cap, trivial to
// group in memory, and it keeps this logic as an independently
// unit-testable pure function rather than adding a second, Postgres-
// specific raw-SQL query style alongside TrafficMetricRepository's existing
// raw SQL (which is raw only for its atomic upsert, not for convenience).
export function groupBucketsByDay(
  buckets: TrafficMetric[],
  from: Date,
  to: Date,
): TrendPoint[] {
  const days = new Map<string, TrendPoint>();
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    const key = dayKey(cursor);
    days.set(key, {
      date: key,
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const bucket of buckets) {
    const day = days.get(dayKey(bucket.bucketStart));
    if (!day) {
      // Defensive: a bucket outside [from, to] shouldn't happen given the
      // caller's own query, but never let one corrupt another day's totals.
      continue;
    }
    day.totalRequests += bucket.totalRequests;
    day.allowedRequests += bucket.allowedRequests;
    day.blockedRequests += bucket.blockedRequests;
  }

  return [...days.values()];
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
