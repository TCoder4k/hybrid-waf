import type { SecurityEvent } from "./api";

const CSV_HEADER = [
  "Thời gian",
  "Loại tấn công",
  "Phương thức",
  "Endpoint",
  "IP nguồn",
  "Quốc gia",
  "Độ tin cậy",
  "Quyết định",
];

// RFC 4180 quoting: wrap in quotes and double up any embedded quote,
// whenever the value contains a comma, quote, or newline.
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function eventToRow(event: SecurityEvent): string {
  return [
    new Date(event.timestamp).toLocaleString(),
    event.attackType,
    event.method,
    event.endpoint,
    event.sourceIp,
    event.country ?? "",
    event.confidence !== null ? event.confidence.toFixed(2) : "",
    event.decision,
  ]
    .map(csvCell)
    .join(",");
}

// Client-side CSV generation — no backend export endpoint exists, and none
// is needed: everything a row needs is already in the fetched SecurityEvent
// list. Prefixed with a UTF-8 BOM so Excel (still the most common opener)
// renders Vietnamese diacritics and the flag/country text correctly.
export function eventsToCsv(events: SecurityEvent[]): string {
  return [CSV_HEADER.join(","), ...events.map(eventToRow)].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
