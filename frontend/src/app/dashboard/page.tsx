"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  getRecentEvents,
  getStats,
  type SecurityEvent,
  type TrafficStats,
} from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { AttackDistribution } from "@/components/AttackDistribution";
import { RecentEventsTable } from "@/components/RecentEventsTable";

const RECENT_EVENTS_PAGE_SIZE = 10;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; stats: TrafficStats; events: SecurityEvent[] }
  | { status: "unavailable" };

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [stats, events] = await Promise.all([
          getStats(),
          getRecentEvents(RECENT_EVENTS_PAGE_SIZE),
        ]);
        if (!cancelled) {
          setState({ status: "ready", stats, events: events.items });
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
  }, [router]);

  function handleLogout() {
    // No server call — logout is client-side-only per ADR-5, there is
    // nothing server-side to revoke.
    clearToken();
    router.push("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-black/[.08] bg-white px-6 py-4 dark:border-white/[.145] dark:bg-[#111]">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Hybrid WAF — Dashboard
        </h1>
        <button
          onClick={handleLogout}
          className="rounded-full border border-black/[.12] px-4 py-1.5 text-sm text-black transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-white/[.08]"
        >
          Log out
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6">
        {state.status === "loading" && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}

        {state.status === "unavailable" && (
          <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            The database is unavailable right now, so stats and recent events
            can&apos;t be loaded. Try again shortly.
          </p>
        )}

        {state.status === "ready" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Total Requests" value={state.stats.totalRequests} />
              <StatCard
                label="Allowed Requests"
                value={state.stats.allowedRequests}
              />
              <StatCard
                label="Blocked Requests"
                value={state.stats.blockedRequests}
              />
              <StatCard
                label="SQL Injection"
                value={state.stats.sqlInjectionBlocks}
              />
              <StatCard label="XSS" value={state.stats.xssBlocks} />
            </div>

            <AttackDistribution
              sqlInjectionBlocks={state.stats.sqlInjectionBlocks}
              xssBlocks={state.stats.xssBlocks}
            />

            <RecentEventsTable events={state.events} />
          </>
        )}
      </main>
    </div>
  );
}
