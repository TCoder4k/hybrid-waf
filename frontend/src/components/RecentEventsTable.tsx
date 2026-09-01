"use client";

import { useState } from "react";
import type { SecurityEvent } from "@/lib/api";
import { Card } from "@/components/Card";
import { CountryFlag } from "@/components/CountryFlag";
import { EventDetailModal } from "@/components/EventDetailModal";

interface RecentEventsTableProps {
  events: SecurityEvent[];
  // All four below default to the Dashboard's "Recent events" widget
  // behavior — the standalone Events page (app/(dashboard)/events) passes
  // its own title, a CSV-export + page-size control, and a pagination
  // footer, reusing this same table markup instead of duplicating it.
  title?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  emptyMessage?: string;
}

const ATTACK_TYPE_STYLES: Record<string, string> = {
  SQL_INJECTION:
    "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  XSS: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};
const DEFAULT_ATTACK_TYPE_STYLE =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

// Every SecurityEvent row is a BLOCK today (ADR-3: BLOCK-only logging), but
// this stays keyed by the actual value rather than hardcoded, so a future
// decision value (should one ever be logged) renders sensibly instead of a
// misleading "BLOCK" badge.
const DECISION_STYLES: Record<string, string> = {
  BLOCK: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};
const DEFAULT_DECISION_STYLE =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

function confidenceBarColor(decision: string): string {
  return decision === "BLOCK" ? "bg-red-500" : "bg-green-500";
}

export function RecentEventsTable({
  events,
  title = "Sự kiện bảo mật gần đây",
  headerRight,
  footer,
  emptyMessage = "Chưa có yêu cầu nào bị chặn.",
}: RecentEventsTableProps) {
  // Pure presentation state, owned here rather than lifted to the page —
  // the modal is fed entirely from a row already in `events`, no new fetch.
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(
    null,
  );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
          {title}
        </h2>
        {headerRight && (
          <div className="flex items-center gap-2">{headerRight}</div>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-500 dark:border-white/[.145]">
                <th className="py-2 pr-4 font-medium">Thời gian</th>
                <th className="py-2 pr-4 font-medium">Loại tấn công</th>
                <th className="py-2 pr-4 font-medium">Phương thức</th>
                <th className="py-2 pr-4 font-medium">Endpoint</th>
                <th className="py-2 pr-4 font-medium">IP nguồn</th>
                <th className="py-2 pr-4 font-medium">Độ tin cậy</th>
                <th className="py-2 pr-4 font-medium">Quyết định</th>
                <th className="py-2 font-medium">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const confidencePct =
                  event.confidence !== null
                    ? Math.round(event.confidence * 100)
                    : 0;
                return (
                  <tr
                    key={event.id}
                    className="border-b border-black/[.05] last:border-0 dark:border-white/[.08]"
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          ATTACK_TYPE_STYLES[event.attackType] ??
                          DEFAULT_ATTACK_TYPE_STYLE
                        }`}
                      >
                        {event.attackType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {event.method}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {event.endpoint}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span
                          className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300"
                          title={
                            event.countryCode
                              ? undefined
                              : "Không xác định được quốc gia (IP nội bộ hoặc không có trong cơ sở dữ liệu GeoIP)"
                          }
                        >
                          {event.countryCode && (
                            <CountryFlag countryCode={event.countryCode} />
                          )}
                          {event.sourceIp}
                        </span>
                        {event.country ? (
                          <span className="text-xs text-zinc-400">
                            {event.country}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">
                            IP nội bộ / không xác định
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className={`h-1.5 rounded-full ${confidenceBarColor(event.decision)}`}
                            style={{ width: `${confidencePct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-zinc-500">
                          {event.confidence !== null
                            ? event.confidence.toFixed(2)
                            : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          DECISION_STYLES[event.decision] ??
                          DEFAULT_DECISION_STYLE
                        }`}
                      >
                        {event.decision}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(event)}
                        className="rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {footer}

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </Card>
  );
}
