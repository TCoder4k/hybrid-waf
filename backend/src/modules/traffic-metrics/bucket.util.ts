// Hourly, UTC bucket key — fixed granularity, not configurable (Phase 9A).
// UTC avoids ambiguity across dev/docker/deploy environments; matches
// SecurityEvent.timestamp's existing convention (Postgres stores UTC).
export function truncateToHour(date: Date): Date {
  const truncated = new Date(date);
  truncated.setUTCMinutes(0, 0, 0);
  return truncated;
}
