export interface DateRange {
  from: Date;
  to: Date;
}

// "Last N days" ending now, inclusive of today. `from` is midnight UTC,
// (N-1) days before `now`; `to` is `now` itself. Shared by every
// range-aware Admin API endpoint (GET /admin/stats, /admin/stats/trend,
// /admin/stats/extra) so "N days" means exactly one thing everywhere.
export function daysToRange(days: number, now: Date = new Date()): DateRange {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from, to: now };
}
