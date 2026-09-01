import type { SystemStatus } from "@/lib/api";
import { Card } from "@/components/Card";

interface SystemStatusPanelProps {
  status: SystemStatus;
}

const ROWS: { key: keyof SystemStatus; label: string }[] = [
  { key: "wafEngine", label: "WAF Engine" },
  { key: "mlService", label: "ML Service" },
  { key: "database", label: "Database" },
  { key: "protectedApi", label: "Protected API" },
];

export function SystemStatusPanel({ status }: SystemStatusPanelProps) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-black dark:text-zinc-50">
        Trạng thái hệ thống
      </h2>
      <div className="flex flex-col divide-y divide-black/[.05] dark:divide-white/[.08]">
        {ROWS.map((row) => {
          const up = status[row.key] === "up";
          return (
            <div
              key={row.key}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                <span
                  className={`size-2 rounded-full ${up ? "bg-green-500" : "bg-red-500"}`}
                />
                {row.label}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  up
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                {up ? "Hoạt động" : "Ngừng hoạt động"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
