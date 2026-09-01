import type { SystemInfo } from "@/lib/api";
import { formatHeaderTimestamp, formatUptimeVN } from "@/lib/format";
import { Card } from "@/components/Card";
import { InfoRow } from "@/components/InfoRow";

interface SystemInfoPanelProps {
  info: SystemInfo;
}

export function SystemInfoPanel({ info }: SystemInfoPanelProps) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-black dark:text-zinc-50">
        Thông tin hệ thống
      </h2>
      <div className="flex flex-col divide-y divide-black/[.05] dark:divide-white/[.08]">
        <InfoRow label="Phiên bản" value={`v${info.version}`} />
        <InfoRow
          label="Môi trường"
          value={
            info.environment.charAt(0).toUpperCase() + info.environment.slice(1)
          }
        />
        <InfoRow
          label="Thời gian hoạt động"
          value={formatUptimeVN(info.uptimeSeconds)}
        />
        <InfoRow
          label="Giờ hệ thống"
          value={formatHeaderTimestamp(new Date(info.serverTime))}
        />
      </div>
    </Card>
  );
}
