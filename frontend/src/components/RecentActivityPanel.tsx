import type { TrafficStats } from "@/lib/api";
import { Card } from "@/components/Card";
import { InfoRow } from "@/components/InfoRow";

interface RecentActivityPanelProps {
  stats: TrafficStats;
}

// Reuses the already-fetched TrafficStats — same numbers as the top stat
// cards, just recompiled into a compact list, no new data.
export function RecentActivityPanel({ stats }: RecentActivityPanelProps) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-black dark:text-zinc-50">
        Hoạt động gần đây
      </h2>
      <div className="flex flex-col divide-y divide-black/[.05] dark:divide-white/[.08]">
        <InfoRow label="Tấn công bị chặn" value={stats.blockedRequests} />
        <InfoRow label="Yêu cầu hợp lệ" value={stats.allowedRequests} />
        <InfoRow label="SQL Injection" value={stats.sqlInjectionBlocks} />
        <InfoRow label="XSS" value={stats.xssBlocks} />
      </div>
    </Card>
  );
}
