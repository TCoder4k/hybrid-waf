// "2026-08-25" -> "25/08" (the Request Trend chart's x-axis labels).
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

// Hand-built "DD/MM/YYYY, H:MM:SS AM/PM" — deterministic across
// server/client and every environment's default locale, rather than
// `toLocaleString()` (whose output format depends on the runtime's
// configured locale and would otherwise risk a hydration mismatch).
export function formatHeaderTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds} ${period}`;
}

// Seconds -> "X ngày Y giờ" (or just "Y giờ" under a day), matching the
// System Info panel's "Thời gian hoạt động" row.
export function formatUptimeVN(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  return days === 0 ? `${hours} giờ` : `${days} ngày ${hours} giờ`;
}
