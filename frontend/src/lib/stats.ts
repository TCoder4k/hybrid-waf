// Shared percentage formatter for stat-card subtitles and the Attack
// Distribution legend — "0%" on an empty denominator rather than NaN/Infinity.
export function pct(part: number, whole: number): string {
  if (whole === 0) {
    return "0%";
  }
  return `${((part / whole) * 100).toFixed(2)}%`;
}
