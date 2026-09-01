"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Ban, CheckCircle2, Code2, Database, RefreshCw } from "lucide-react";
import {
  ApiError,
  getRecentEvents,
  getStats,
  getStatsExtra,
  getStatsTrend,
  getSystemInfo,
  getSystemStatus,
  type AdminStatsExtra,
  type SecurityEvent,
  type SystemInfo,
  type SystemStatus,
  type TrafficStats,
  type TrendPoint,
} from "@/lib/api";
import { pct } from "@/lib/stats";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DateRangeSelector, type DateRangeDays } from "@/components/DateRangeSelector";
import { RequestTrendChart } from "@/components/RequestTrendChart";
import { AttackDistributionChart } from "@/components/AttackDistributionChart";
import { RecentEventsTable } from "@/components/RecentEventsTable";
import { SystemStatusPanel } from "@/components/SystemStatusPanel";
import { SystemInfoPanel } from "@/components/SystemInfoPanel";
import { QuickStatsPanel } from "@/components/QuickStatsPanel";
import { RecentActivityPanel } from "@/components/RecentActivityPanel";

const RECENT_EVENTS_PAGE_SIZE = 10;

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      stats: TrafficStats;
      trend: TrendPoint[];
      events: SecurityEvent[];
      systemStatus: SystemStatus;
      systemInfo: SystemInfo;
      extra: AdminStatsExtra;
    }
  | { status: "unavailable" };

export default function DashboardPage() {
  const router = useRouter();
  const [days, setDays] = useState<DateRangeDays>(7);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Bumped by the header's refresh button to re-run the effect below on
  // demand, on top of the automatic re-run whenever `days` changes.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [stats, trend, events, systemStatus, systemInfo, extra] =
          await Promise.all([
            getStats(days),
            getStatsTrend(days),
            getRecentEvents(RECENT_EVENTS_PAGE_SIZE),
            getSystemStatus(),
            getSystemInfo(),
            getStatsExtra(days),
          ]);
        if (!cancelled) {
          setState({
            status: "ready",
            stats,
            trend,
            events: events.items,
            systemStatus,
            systemInfo,
            extra,
          });
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        // 401: the token is missing/expired (api.ts already cleared it) —
        // send the admin back to /login. Anything else (503 DB-down, a
        // network error) is shown inline instead of crashing the page.
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
  }, [days, refreshKey, router]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tổng quan hệ thống"
        subtitle="Giám sát và theo dõi an ninh ứng dụng web theo thời gian thực"
        right={
          <>
            <DateRangeSelector value={days} onChange={setDays} />
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              aria-label="Làm mới"
              className="flex size-9 items-center justify-center rounded-lg border border-black/[.12] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
            >
              <RefreshCw size={16} />
            </button>
          </>
        }
      />

      {state.status === "loading" && (
        <p className="text-sm text-zinc-500">Đang tải…</p>
      )}

      {state.status === "unavailable" && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          Không thể tải dữ liệu hệ thống lúc này. Vui lòng thử lại sau ít
          phút.
        </p>
      )}

      {state.status === "ready" && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Tổng yêu cầu"
              value={state.stats.totalRequests}
              subtitle="Tất cả yêu cầu"
              percentage="100%"
              icon={Activity}
              iconColor="blue"
              pillColor="gray"
            />
            <StatCard
              label="Yêu cầu cho phép"
              value={state.stats.allowedRequests}
              subtitle="Yêu cầu hợp lệ"
              percentage={pct(state.stats.allowedRequests, state.stats.totalRequests)}
              icon={CheckCircle2}
              iconColor="green"
              pillColor="green"
            />
            <StatCard
              label="Yêu cầu bị chặn"
              value={state.stats.blockedRequests}
              subtitle="Yêu cầu độc hại"
              percentage={pct(state.stats.blockedRequests, state.stats.totalRequests)}
              icon={Ban}
              iconColor="red"
              pillColor="red"
            />
            <StatCard
              label="SQL Injection"
              value={state.stats.sqlInjectionBlocks}
              subtitle="Tấn công SQLi"
              percentage={pct(state.stats.sqlInjectionBlocks, state.stats.blockedRequests)}
              icon={Database}
              iconColor="purple"
              pillColor="purple"
            />
            <StatCard
              label="XSS"
              value={state.stats.xssBlocks}
              subtitle="Tấn công XSS"
              percentage={pct(state.stats.xssBlocks, state.stats.blockedRequests)}
              icon={Code2}
              iconColor="orange"
              pillColor="orange"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RequestTrendChart trend={state.trend} />
            </div>
            <AttackDistributionChart
              sqlInjectionBlocks={state.stats.sqlInjectionBlocks}
              xssBlocks={state.stats.xssBlocks}
            />
          </div>

          <RecentEventsTable events={state.events} />

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <SystemStatusPanel status={state.systemStatus} />
            <SystemInfoPanel info={state.systemInfo} />
            <QuickStatsPanel stats={state.stats} extra={state.extra} />
            <RecentActivityPanel stats={state.stats} />
          </div>
        </>
      )}
    </div>
  );
}
