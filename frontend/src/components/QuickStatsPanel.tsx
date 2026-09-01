import type { AdminStatsExtra, TrafficStats } from "@/lib/api";
import { pct } from "@/lib/stats";
import { Card } from "@/components/Card";
import { InfoRow } from "@/components/InfoRow";

interface QuickStatsPanelProps {
  stats: TrafficStats;
  extra: AdminStatsExtra;
}

export function QuickStatsPanel({ stats, extra }: QuickStatsPanelProps) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-black dark:text-zinc-50">
        Thống kê nhanh
      </h2>
      <div className="flex flex-col divide-y divide-black/[.05] dark:divide-white/[.08]">
        <InfoRow label="Requests/giờ" value={extra.requestsThisHour} />
        <InfoRow
          label="Tỷ lệ chặn"
          value={pct(stats.blockedRequests, stats.totalRequests)}
        />
        <InfoRow label="IP độc hại" value={extra.maliciousIpCount} />
        <InfoRow label="Quốc gia" value={extra.countryCount} />
      </div>
    </Card>
  );
}
