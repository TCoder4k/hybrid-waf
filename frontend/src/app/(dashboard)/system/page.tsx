"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Globe, Network, RefreshCw, Server } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError, getSystemInfo, getSystemStatus, type SystemInfo, type SystemStatus } from "@/lib/api";
import { formatHeaderTimestamp } from "@/lib/format";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

const COMPONENTS = [
  { key: "wafEngine", label: "WAF Engine", icon: ShieldIcon },
  { key: "mlService", label: "ML Service", icon: Activity },
  { key: "database", label: "PostgreSQL", icon: Database },
  { key: "protectedApi", label: "Protected API", icon: Globe },
] as const;

function ShieldIcon({ size = 20 }: { size?: number }) {
  return <Server size={size} />;
}

export default function SystemManagementPage() {
  const router = useRouter();
  const [data, setData] = useState<{ status: SystemStatus; info: SystemInfo }>();
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSystemStatus(), getSystemInfo()])
      .then(([status, info]) => {
        if (!cancelled) setData({ status, info });
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [refreshKey, router]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quản lý hệ thống"
        subtitle="Theo dõi sức khỏe các thành phần đang phục vụ WAF"
        right={
          <button
            type="button"
            onClick={() => { setError(false); setData(undefined); setRefreshKey((key) => key + 1); }}
            aria-label="Làm mới trạng thái hệ thống"
            className="flex size-9 items-center justify-center rounded-lg border border-black/[.12] text-zinc-600 hover:bg-black/[.04]"
          >
            <RefreshCw size={16} />
          </button>
        }
      />
      {error && <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">Không thể tải trạng thái hệ thống.</p>}
      {!data && !error && <p className="text-sm text-zinc-500">Đang tải...</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {COMPONENTS.map(({ key, label, icon: Icon }) => {
              const component = data.status[key];
              const up = component.status === "up";
              return (
                <Card key={key} className="relative overflow-hidden">
                  <div className={`absolute inset-x-0 top-0 h-1 ${up ? "bg-emerald-500" : "bg-red-500"}`} />
                  <div className="flex items-start justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><Icon size={20} /></span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {up ? "Up" : "Down"}
                    </span>
                  </div>
                  <h2 className="mt-5 font-semibold text-zinc-900">{label}</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Độ trễ: {component.latencyMs === null ? "—" : `${component.latencyMs} ms`}
                  </p>
                </Card>
              );
            })}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-center gap-3"><Network size={18} className="text-zinc-500" /><h2 className="font-semibold text-zinc-900">Lần kiểm tra gần nhất</h2></div>
              <p className="mt-3 text-sm text-zinc-600">{formatHeaderTimestamp(new Date(data.status.checkedAt))}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-3"><Server size={18} className="text-zinc-500" /><h2 className="font-semibold text-zinc-900">Thông tin backend</h2></div>
              <p className="mt-3 text-sm text-zinc-600">v{data.info.version} · {data.info.environment}</p>
              <p className="mt-1 text-sm text-zinc-500">ML confidence threshold: {data.info.mlConfidenceThreshold.toFixed(2)}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
