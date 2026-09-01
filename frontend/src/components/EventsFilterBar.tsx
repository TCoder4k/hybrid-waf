import { RefreshCw, Search } from "lucide-react";
import { Card } from "@/components/Card";
import { DateRangeSelector, type DateRangeDays } from "@/components/DateRangeSelector";

export interface EventsFilterValue {
  search: string;
  attackType: string; // "" = Tất cả
  method: string; // "" = Tất cả
  minConfidence: string; // raw input text; "" = unset
  days: DateRangeDays;
}

interface EventsFilterBarProps {
  value: EventsFilterValue;
  onChange: (value: EventsFilterValue) => void;
  onRefresh: () => void;
}

const ATTACK_TYPE_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "SQL_INJECTION", label: "SQL Injection" },
  { value: "XSS", label: "XSS" },
];

// Every method the Hybrid Decision Engine can see coming through
// NormalizedRequest — a fixed dropdown rather than a free-text field, since
// the backend does an exact (case-insensitive) match on this value.
const METHOD_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
];

const inputClasses =
  "rounded-lg border border-black/[.12] bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-black/40 dark:border-white/[.2] dark:bg-[#111] dark:text-zinc-300 dark:focus:border-white/40";

// Filters translate directly to GET /admin/events query params
// (search/attackType/method/minConfidence/days) — see docs/architecture.md
// §11. Search matches endpoint OR sourceIp only; requestMeta never stores a
// user-agent (ADR-4 redaction excludes headers), so there is nothing there
// to search.
export function EventsFilterBar({
  value,
  onChange,
  onRefresh,
}: EventsFilterBarProps) {
  function set<K extends keyof EventsFilterValue>(
    key: K,
    fieldValue: EventsFilterValue[K],
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <label className="flex flex-col gap-1 text-sm lg:col-span-2">
          <span className="text-xs text-zinc-500">Tìm kiếm</span>
          <span className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={value.search}
              onChange={(e) => set("search", e.target.value)}
              placeholder="Tìm theo endpoint, IP..."
              className={`${inputClasses} w-full pl-8`}
            />
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Loại tấn công</span>
          <select
            value={value.attackType}
            onChange={(e) => set("attackType", e.target.value)}
            className={`${inputClasses} cursor-pointer`}
          >
            {ATTACK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Phương thức</span>
          <select
            value={value.method}
            onChange={(e) => set("method", e.target.value)}
            className={`${inputClasses} cursor-pointer`}
          >
            {METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Độ tin cậy (min)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={value.minConfidence}
            onChange={(e) => set("minConfidence", e.target.value)}
            placeholder="0 - 1"
            className={inputClasses}
          />
        </label>

        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-xs text-zinc-500">Khoảng thời gian</span>
            <DateRangeSelector
              value={value.days}
              onChange={(days) => set("days", days)}
            />
          </label>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Làm mới"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-black/[.12] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    </Card>
  );
}
