"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Binary,
  Cpu,
  Info,
  Layers,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ApiError,
  getDetectionAnalysis,
  type DetectionAnalysisResult,
} from "@/lib/api";
import { pct } from "@/lib/stats";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import {
  DateRangeSelector,
  type DateRangeDays,
} from "@/components/DateRangeSelector";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DetectionAnalysisResult }
  | { status: "unavailable" };

const RULE_COLOR = "#3b82f6"; // blue-500
const ML_COLOR = "#10b981";   // emerald-500
const BOTH_COLOR = "#8b5cf6"; // purple-500

export default function StatisticsPage() {
  const router = useRouter();
  const [days, setDays] = useState<DateRangeDays>(7);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const data = await getDetectionAnalysis(days);
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      } catch (err) {
        if (cancelled) return;
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

  const rightControls = (
    <div className="flex items-center gap-2">
      <DateRangeSelector value={days} onChange={(d) => setDays(d)} />
      <button
        type="button"
        onClick={() => setRefreshKey((k) => k + 1)}
        className="flex items-center gap-1.5 rounded-lg border border-black/[.12] bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:bg-[#111] dark:text-zinc-300 dark:hover:bg-white/[.08]"
        title="Làm mới dữ liệu"
      >
        <RefreshCw size={14} />
        <span className="hidden sm:inline">Làm mới</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Thống kê chi tiết & Phân tích Đóng góp Hybrid"
        subtitle="Đánh giá hiệu quả phối hợp và mức độ đóng góp của Rule Engine và ML Engine trong các quyết định chặn"
        right={rightControls}
      />

      {/* Business Disclaimer Banner (BR-01 & Banner Disclaimer) */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="text-sm leading-relaxed">
          <strong className="font-semibold">Lưu ý nghiệp vụ quan trọng: </strong>
          Phân tích dựa trên các yêu cầu đã bị chặn — không bao gồm lưu lượng
          được cho phép. Số liệu dưới đây thể hiện mức độ phát hiện và tính bổ trợ
          giữa <strong>Rule Engine</strong> và <strong>ML Engine</strong> đối với
          tập các cuộc tấn công đã được Hybrid WAF ngăn chặn thành công.
        </div>
      </div>

      {state.status === "loading" && <LoadingSkeleton />}

      {state.status === "unavailable" && (
        <Card className="py-12 text-center">
          <AlertCircle className="mx-auto mb-3 size-8 text-amber-500" />
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">
            Không thể tải dữ liệu phân tích
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Dịch vụ cơ sở dữ liệu có thể đang tạm thời gián đoạn. Vui lòng thử
            lại sau.
          </p>
        </Card>
      )}

      {state.status === "ready" && (
        <AnalysisContent data={state.data} days={days} />
      )}
    </div>
  );
}

function AnalysisContent({
  data,
  days,
}: {
  data: DetectionAnalysisResult;
  days: number;
}) {
  const total = data.totalBlocked;

  if (total === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <Shield className="mb-3 size-12 text-zinc-300 dark:text-zinc-600" />
        <h3 className="text-base font-semibold text-black dark:text-zinc-50">
          Chưa có yêu cầu nào bị chặn trong {days} ngày qua
        </h3>
        <p className="mt-1 text-sm text-zinc-500 max-w-md">
          Không có sự kiện bảo mật nào được ghi nhận trong khoảng thời gian này.
          Hãy thử chọn phạm vi thời gian dài hơn hoặc gửi request kiểm thử.
        </p>
      </Card>
    );
  }

  // Detection Source breakdown data for pie chart
  const pieData = [
    { name: "Rule-only", value: data.ruleOnlyCount, color: RULE_COLOR },
    { name: "ML-only", value: data.mlOnlyCount, color: ML_COLOR },
    { name: "Both (Cả hai)", value: data.bothCount, color: BOTH_COLOR },
  ].filter((d) => d.value > 0);

  // Engine participation percentages relative to total blocked
  const rulePartPct = total > 0 ? ((data.ruleContributionCount / total) * 100).toFixed(1) : "0.0";
  const mlPartPct = total > 0 ? ((data.mlContributionCount / total) * 100).toFixed(1) : "0.0";

  // Confidence bucket counts
  const conf78 = data.confidenceBuckets["0.7-0.8"];
  const conf89 = data.confidenceBuckets["0.8-0.9"];
  const conf910 = data.confidenceBuckets["0.9-1.0"];
  const totalMlBucketed = conf78 + conf89 + conf910;

  return (
    <div className="flex flex-col gap-6">
      {/* SECTION 1: Detection Source Distribution (100% mutual exclusive split) */}
      <Card className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">
              Phân bố Nguồn phát hiện (Detection Source Distribution)
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Phân loại độc quyền từng sự kiện bị chặn theo engine phát hiện: Chỉ
            Rule, Chỉ ML, hoặc Cả hai cùng phát hiện (tổng 3 nhóm = 100%).
          </p>
        </div>

        {/* 3 Metric Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Rule-only card */}
          <div className="flex flex-col gap-2 rounded-xl border border-blue-200/80 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Rule-only
              </span>
              <span className="size-2.5 rounded-full bg-blue-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                {data.ruleOnlyCount}
              </span>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                ({pct(data.ruleOnlyCount, total)})
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Chỉ Rule Engine phát hiện mối nguy (ML phân loại bình thường hoặc không xác định).
            </p>
          </div>

          {/* ML-only card */}
          <div className="flex flex-col gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                ML-only
              </span>
              <span className="size-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                {data.mlOnlyCount}
              </span>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                ({pct(data.mlOnlyCount, total)})
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Chỉ ML Engine phát hiện bất thường (Rule bỏ sót hoặc payload bị obfuscate).
            </p>
          </div>

          {/* Both card */}
          <div className="flex flex-col gap-2 rounded-xl border border-purple-200/80 bg-purple-50/40 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                Both (Đồng thuận)
              </span>
              <span className="size-2.5 rounded-full bg-purple-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                {data.bothCount}
              </span>
              <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                ({pct(data.bothCount, total)})
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Cả Rule Engine và ML Engine cùng đồng thuận phát hiện tấn công.
            </p>
          </div>
        </div>

        {/* Visual representation: Donut Chart + Stacked Bar */}
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          <div className="flex flex-col items-center justify-center lg:col-span-4">
            <div className="relative size-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="65%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => [
                      `${val ?? 0} sự kiện (${pct(Number(val ?? 0), total)})`,
                      "",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-black dark:text-zinc-50">
                  {total}
                </span>
                <span className="text-[11px] text-zinc-500">Tổng bị chặn</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-8">
            <div className="text-xs font-medium text-zinc-500">
              Tỷ trọng tích lũy nguồn phát hiện:
            </div>
            {/* Stacked segmented bar */}
            <div className="flex h-6 w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
              {data.ruleOnlyCount > 0 && (
                <div
                  style={{ width: `${(data.ruleOnlyCount / total) * 100}%` }}
                  className="flex items-center justify-center bg-blue-500 text-[11px] font-semibold text-white transition-all"
                  title={`Rule-only: ${data.ruleOnlyCount} (${pct(data.ruleOnlyCount, total)})`}
                >
                  {data.ruleOnlyCount / total > 0.08 ? `${pct(data.ruleOnlyCount, total)}` : ""}
                </div>
              )}
              {data.bothCount > 0 && (
                <div
                  style={{ width: `${(data.bothCount / total) * 100}%` }}
                  className="flex items-center justify-center bg-purple-500 text-[11px] font-semibold text-white transition-all"
                  title={`Both: ${data.bothCount} (${pct(data.bothCount, total)})`}
                >
                  {data.bothCount / total > 0.08 ? `${pct(data.bothCount, total)}` : ""}
                </div>
              )}
              {data.mlOnlyCount > 0 && (
                <div
                  style={{ width: `${(data.mlOnlyCount / total) * 100}%` }}
                  className="flex items-center justify-center bg-emerald-500 text-[11px] font-semibold text-white transition-all"
                  title={`ML-only: ${data.mlOnlyCount} (${pct(data.mlOnlyCount, total)})`}
                >
                  {data.mlOnlyCount / total > 0.08 ? `${pct(data.mlOnlyCount, total)}` : ""}
                </div>
              )}
            </div>

            {/* Legend info */}
            <div className="grid grid-cols-1 gap-2 text-xs text-zinc-600 sm:grid-cols-3 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded bg-blue-500" />
                <span>Rule-only: <strong>{data.ruleOnlyCount}</strong> ({pct(data.ruleOnlyCount, total)})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3 rounded bg-purple-500" />
                <span>Both: <strong>{data.bothCount}</strong> ({pct(data.bothCount, total)})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3 rounded bg-emerald-500" />
                <span>ML-only: <strong>{data.mlOnlyCount}</strong> ({pct(data.mlOnlyCount, total)})</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION 2: Engine Participation & Contribution (Rule-only+Both vs ML-only+Both) */}
      <Card className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">
              Mức độ Tham gia & Đóng góp của từng Engine (Engine Participation)
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Đánh giá tỷ lệ request bị chặn mà mỗi engine đã tham gia nhận diện (tính cả phát hiện độc lập và phát hiện đồng thuận).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Rule Engine Participation */}
          <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-transparent p-5 dark:border-blue-900/30 dark:from-blue-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-black dark:text-zinc-100">
                  Rule Engine Đóng góp
                </h3>
              </div>
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                {rulePartPct}%
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                {data.ruleContributionCount}
              </span>
              <span className="text-xs text-zinc-500">
                / {total} sự kiện bị chặn
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(Number(rulePartPct), 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-zinc-500">
              <span>Công thức: Rule-only ({data.ruleOnlyCount}) + Both ({data.bothCount})</span>
              <span>Độ phủ: {rulePartPct}%</span>
            </div>
          </div>

          {/* ML Engine Participation */}
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-transparent p-5 dark:border-emerald-900/30 dark:from-emerald-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="size-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-black dark:text-zinc-100">
                  ML Engine Đóng góp
                </h3>
              </div>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                {mlPartPct}%
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {data.mlContributionCount}
              </span>
              <span className="text-xs text-zinc-500">
                / {total} sự kiện bị chặn
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(Number(mlPartPct), 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-zinc-500">
              <span>Công thức: ML-only ({data.mlOnlyCount}) + Both ({data.bothCount})</span>
              <span>Độ phủ: {mlPartPct}%</span>
            </div>
          </div>
        </div>

        {/* Business Explanation Note on Hybrid Synergy */}
        <div className="rounded-lg border border-purple-200/60 bg-purple-50/30 p-3 text-xs leading-relaxed text-purple-950 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-200">
          <span className="font-semibold">💡 Bản chất kiến trúc Hybrid WAF: </span>
          Tổng tỷ lệ tham gia của Rule ({rulePartPct}%) và ML ({mlPartPct}%) vượt quá 100% vì phần giao{" "}
          <strong>Both ({data.bothCount} sự kiện)</strong> được tính cho cả hai engine. Đây chính là minh chứng rõ nhất
          cho tính hiệp đồng: Rule Engine đảm bảo tốc độ và tính tất định cho các mẫu đã biết, trong khi ML Engine học
          và bao quát các biến thể hoặc bổ trợ kiểm chứng chéo.
        </div>
      </Card>

      {/* SECTION 3: ML Confidence Distribution Buckets (BR-10 & BR-11) */}
      <Card className="flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2">
            <Binary className="size-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">
              Phân bố Độ tin cậy ML Engine (Confidence Buckets)
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Thống kê các mức confidence score của ML đối với các sự kiện có kết quả dự đoán (ngưỡng tối thiểu 0.7 theo BR-10 & BR-11).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Bucket 0.7 - <0.8 */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Độ tin cậy vừa</span>
              <span className="font-mono font-medium">0.70 – &lt;0.80</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                {conf78}
              </span>
              <span className="text-xs text-zinc-500">
                ({pct(conf78, totalMlBucketed || 1)})
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{
                  width: `${totalMlBucketed > 0 ? (conf78 / totalMlBucketed) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Bucket 0.8 - <0.9 */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Độ tin cậy cao</span>
              <span className="font-mono font-medium">0.80 – &lt;0.90</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                {conf89}
              </span>
              <span className="text-xs text-zinc-500">
                ({pct(conf89, totalMlBucketed || 1)})
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{
                  width: `${totalMlBucketed > 0 ? (conf89 / totalMlBucketed) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Bucket 0.9 - 1.0 */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Độ tin cậy rất cao</span>
              <span className="font-mono font-medium">0.90 – 1.00</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                {conf910}
              </span>
              <span className="text-xs text-zinc-500">
                ({pct(conf910, totalMlBucketed || 1)})
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${totalMlBucketed > 0 ? (conf910 / totalMlBucketed) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION 4: Top 10 Endpoints & Top 10 Reasons Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top 10 Endpoints */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-red-500" />
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                Top 10 Endpoints bị tấn công nhiều nhất
              </h3>
            </div>
            <span className="text-xs text-zinc-500">
              {data.topEndpoints.length} mục
            </span>
          </div>

          {data.topEndpoints.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">
              Chưa có dữ liệu endpoint.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black/[.08] text-zinc-500 dark:border-white/[.1]">
                    <th className="py-2 pr-2 font-medium w-8">#</th>
                    <th className="py-2 pr-4 font-medium">Endpoint</th>
                    <th className="py-2 pr-2 text-right font-medium">Số lần</th>
                    <th className="py-2 text-right font-medium w-16">Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.04] dark:divide-white/[.04]">
                  {data.topEndpoints.map((item, idx) => (
                    <tr
                      key={item.endpoint}
                      className="hover:bg-black/[.02] dark:hover:bg-white/[.02]"
                    >
                      <td className="py-2.5 pr-2 font-mono text-zinc-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 pr-4">
                        <EndpointBadge endpoint={item.endpoint} />
                      </td>
                      <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-black dark:text-zinc-100">
                        {item.count}
                      </td>
                      <td className="py-2.5 text-right font-mono text-zinc-500">
                        {pct(item.count, total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top 10 Detection Reasons */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                Top 10 Lý do phát hiện (Detection Reasons)
              </h3>
            </div>
            <span className="text-xs text-zinc-500">
              {data.topReasons.length} mục
            </span>
          </div>

          {data.topReasons.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">
              Chưa có dữ liệu lý do phát hiện.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black/[.08] text-zinc-500 dark:border-white/[.1]">
                    <th className="py-2 pr-2 font-medium w-8">#</th>
                    <th className="py-2 pr-4 font-medium">Lý do nguyên bản</th>
                    <th className="py-2 pr-2 text-right font-medium">Số lần</th>
                    <th className="py-2 text-right font-medium w-16">Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.04] dark:divide-white/[.04]">
                  {data.topReasons.map((item, idx) => (
                    <tr
                      key={`${item.reason}-${idx}`}
                      className="hover:bg-black/[.02] dark:hover:bg-white/[.02]"
                    >
                      <td className="py-2.5 pr-2 font-mono text-zinc-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className="line-clamp-2 font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
                          title={item.reason}
                        >
                          {item.reason}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-black dark:text-zinc-100">
                        {item.count}
                      </td>
                      <td className="py-2.5 text-right font-mono text-zinc-500">
                        {pct(item.count, total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function EndpointBadge({ endpoint }: { endpoint: string }) {
  const parts = endpoint.split(" ");
  if (parts.length >= 2) {
    const method = parts[0];
    const path = parts.slice(1).join(" ");
    const methodColor =
      method === "GET"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
        : method === "POST"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
        : method === "PUT"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300";

    return (
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${methodColor}`}>
          {method}
        </span>
        <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
          {path}
        </span>
      </div>
    );
  }

  return (
    <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
      {endpoint}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-28 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-28 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="h-64 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-44 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-44 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-72 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
