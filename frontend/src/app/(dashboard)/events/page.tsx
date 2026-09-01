"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { ApiError, getEvents, type EventListFilter, type SecurityEvent } from "@/lib/api";
import { downloadCsv, eventsToCsv } from "@/lib/csv";
import { PageHeader } from "@/components/PageHeader";
import { EventsFilterBar, type EventsFilterValue } from "@/components/EventsFilterBar";
import { RecentEventsTable } from "@/components/RecentEventsTable";
import { Pagination } from "@/components/Pagination";

const DEFAULT_FILTER: EventsFilterValue = {
  search: "",
  attackType: "",
  method: "",
  minConfidence: "",
  days: 7,
};

// Debounce delay for the free-text search field and the min-confidence
// number input, so typing doesn't fire a request per keystroke.
const FILTER_DEBOUNCE_MS = 300;
// CSV export loops GET /admin/events (capped at pageSize=100) until every
// matching row is collected; this bounds that loop against a filter that
// somehow always returns rows.
const EXPORT_HARD_CAP = 5000;
const EXPORT_PAGE_SIZE = 100;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; events: SecurityEvent[]; total: number }
  | { status: "unavailable" };

function toApiFilter(
  filter: EventsFilterValue,
): Omit<EventListFilter, "page" | "pageSize"> {
  const trimmedConfidence = filter.minConfidence.trim();
  const minConfidence =
    trimmedConfidence === "" ? undefined : Number(trimmedConfidence);
  return {
    attackType: filter.attackType || undefined,
    method: filter.method || undefined,
    search: filter.search.trim() || undefined,
    minConfidence:
      minConfidence !== undefined && Number.isFinite(minConfidence)
        ? minConfidence
        : undefined,
    days: filter.days,
  };
}

export default function EventsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<EventsFilterValue>(DEFAULT_FILTER);
  // Debounced copy that actually drives fetching — see the effect below.
  const [appliedFilter, setAppliedFilter] =
    useState<EventsFilterValue>(DEFAULT_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Debounce: only commit `filter` -> `appliedFilter` (and reset back to
  // page 1) after the user pauses typing/selecting. The setState calls
  // happen inside the setTimeout callback, not synchronously in the effect
  // body, matching the deferred pattern already used by Header.tsx's clock.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedFilter(filter);
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getEvents({
          ...toApiFilter(appliedFilter),
          page,
          pageSize,
        });
        if (!cancelled) {
          setState({
            status: "ready",
            events: result.items,
            total: result.total,
          });
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setState({ status: "unavailable" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [appliedFilter, page, pageSize, refreshKey, router]);

  async function handleExportCsv() {
    setExportError(null);
    setExporting(true);
    try {
      const apiFilter = toApiFilter(appliedFilter);
      const collected: SecurityEvent[] = [];
      const maxPages = Math.ceil(EXPORT_HARD_CAP / EXPORT_PAGE_SIZE);
      for (let exportPage = 1; exportPage <= maxPages; exportPage += 1) {
        const result = await getEvents({
          ...apiFilter,
          page: exportPage,
          pageSize: EXPORT_PAGE_SIZE,
        });
        collected.push(...result.items);
        if (collected.length >= result.total || result.items.length === 0) {
          break;
        }
      }
      downloadCsv(
        `security-events-${new Date().toISOString().slice(0, 10)}.csv`,
        eventsToCsv(collected),
      );
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Không thể xuất CSV lúc này. Vui lòng thử lại.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sự kiện bảo mật"
        subtitle="Danh sách các request đã bị WAF chặn và ghi vết (ADR-3, ADR-4)"
      />

      <EventsFilterBar
        value={filter}
        onChange={setFilter}
        onRefresh={() => setRefreshKey((key) => key + 1)}
      />

      {state.status === "loading" && (
        <p className="text-sm text-zinc-500">Đang tải…</p>
      )}

      {state.status === "unavailable" && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          Không thể tải dữ liệu sự kiện lúc này. Vui lòng thử lại sau ít phút.
        </p>
      )}

      {state.status === "ready" && (
        <RecentEventsTable
          events={state.events}
          title="Danh sách sự kiện"
          emptyMessage="Không có sự kiện nào khớp với bộ lọc hiện tại."
          headerRight={
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={exporting || state.events.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-black/[.12] px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
            >
              <Download size={14} />
              {exporting ? "Đang xuất…" : "Xuất CSV"}
            </button>
          }
          footer={
            <Pagination
              page={page}
              pageSize={pageSize}
              total={state.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      )}

      {exportError && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {exportError}
        </p>
      )}
    </div>
  );
}
