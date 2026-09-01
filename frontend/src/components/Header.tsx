"use client";

import { useEffect, useState } from "react";
import { Menu, Shield } from "lucide-react";
import { formatHeaderTimestamp } from "@/lib/format";

interface HeaderProps {
  username: string;
  onMenuClick: () => void;
}

const CLOCK_TICK_MS = 1000;

export function Header({ username, onMenuClick }: HeaderProps) {
  // Starts `null` (not `new Date()`) so the server-rendered and first
  // client-rendered markup match exactly — filling in the real time only
  // after mount avoids a hydration mismatch from clock drift.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    // The first tick is deferred via setTimeout (a callback from an
    // external platform API), not called synchronously here — an
    // immediate `update()` would fire a setState synchronously inside the
    // effect body itself, which is what react-hooks/set-state-in-effect
    // flags. 0ms is imperceptible to the user; it just needs to not be
    // literally in the same synchronous tick as the effect running.
    const timeout = setTimeout(update, 0);
    const interval = setInterval(update, CLOCK_TICK_MS);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-[#111]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded p-1.5 text-zinc-500 hover:bg-black/[.04] lg:hidden dark:hover:bg-white/[.08]"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-blue-600 text-white">
            <Shield size={18} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-black dark:text-zinc-50">
              Hybrid WAF
            </span>
            <span className="text-xs text-zinc-500">
              Web Application Firewall
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 sm:flex dark:bg-green-900/30 dark:text-green-300">
          <span className="size-2 rounded-full bg-green-500" />
          <span>Hệ thống hoạt động</span>
          {now && (
            <span className="text-green-600/70 dark:text-green-400/70">
              {formatHeaderTimestamp(now)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {username.charAt(0).toUpperCase() || "?"}
          </span>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              {username || "admin"}
            </span>
            <span className="text-xs text-zinc-500">Quản trị viên</span>
          </div>
        </div>
      </div>
    </header>
  );
}
