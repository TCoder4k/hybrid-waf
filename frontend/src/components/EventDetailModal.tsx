"use client";

import { X } from "lucide-react";
import type { SecurityEvent } from "@/lib/api";
import { CountryFlag } from "@/components/CountryFlag";
import { InfoRow } from "@/components/InfoRow";

interface EventDetailModalProps {
  event: SecurityEvent | null;
  onClose: () => void;
}

// Fed entirely from the row already fetched by RecentEventsTable — no
// second network call, since GET /admin/events already returns every field
// shown here (including the redacted requestMeta / detector reasoning).
export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  if (!event) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#111]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Chi tiết sự kiện
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-black/[.04] dark:hover:bg-white/[.08]"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col divide-y divide-black/[.05] dark:divide-white/[.08]">
          <InfoRow label="Thời gian" value={new Date(event.timestamp).toLocaleString()} />
          <InfoRow label="Loại tấn công" value={event.attackType} />
          <InfoRow label="Phương thức" value={event.method} />
          <InfoRow label="Endpoint" value={<span className="font-mono text-xs">{event.endpoint}</span>} />
          <InfoRow
            label="IP nguồn"
            value={
              event.countryCode ? (
                <span className="flex items-center gap-1.5">
                  <CountryFlag countryCode={event.countryCode} />
                  {event.sourceIp}
                </span>
              ) : (
                event.sourceIp
              )
            }
          />
          <InfoRow
            label="Quốc gia"
            value={
              event.country ?? "Không xác định (IP nội bộ hoặc không có trong GeoIP)"
            }
          />
          <InfoRow
            label="Độ tin cậy"
            value={event.confidence !== null ? event.confidence.toFixed(2) : "—"}
          />
          <InfoRow label="Quyết định" value={event.decision} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">
            Chi tiết phát hiện (rule + ML)
          </span>
          <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {JSON.stringify(
              { ruleResult: event.ruleResult, mlResult: event.mlResult },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
