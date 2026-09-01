"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/Card";
import type { TrendPoint } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

interface RequestTrendChartProps {
  trend: TrendPoint[];
}

// recharts renders to inline SVG attributes, not Tailwind classes, so
// `dark:` variants don't apply inside the chart itself — these colors are
// chosen to stay legible on both the light and near-black page backgrounds,
// an intentionally MVP-level dark-chart treatment matching the rest of the
// app's no-theme-toggle (prefers-color-scheme-only) approach.
const AXIS_COLOR = "#a1a1aa"; // zinc-400
const TOTAL_COLOR = "#3b82f6"; // blue-500
const ALLOWED_COLOR = "#22c55e"; // green-500
const BLOCKED_COLOR = "#ef4444"; // red-500

export function RequestTrendChart({ trend }: RequestTrendChartProps) {
  const data = trend.map((point) => ({
    label: formatShortDate(point.date),
    total: point.totalRequests,
    allowed: point.allowedRequests,
    blocked: point.blockedRequests,
  }));

  return (
    <Card className="flex h-full flex-col gap-4">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        Xu hướng yêu cầu
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={AXIS_COLOR}
              strokeOpacity={0.2}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: AXIS_COLOR }}
              axisLine={{ stroke: AXIS_COLOR, strokeOpacity: 0.3 }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: AXIS_COLOR }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelStyle={{ color: "#18181b" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="total"
              name="Tổng"
              stroke={TOTAL_COLOR}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="allowed"
              name="Cho phép"
              stroke={ALLOWED_COLOR}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="blocked"
              name="Bị chặn"
              stroke={BLOCKED_COLOR}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
