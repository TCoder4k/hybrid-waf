"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card } from "@/components/Card";
import { pct } from "@/lib/stats";

interface AttackDistributionChartProps {
  sqlInjectionBlocks: number;
  xssBlocks: number;
}

const SQL_COLOR = "#ef4444"; // red-500
const XSS_COLOR = "#f97316"; // orange-500

// Donut chart with a manual legend (dot + name + count + percent) — recharts'
// built-in <Legend> can't easily produce this exact layout, and the count in
// the center needs to be an absolutely-positioned overlay since recharts has
// no built-in "center label" for a Pie.
export function AttackDistributionChart({
  sqlInjectionBlocks,
  xssBlocks,
}: AttackDistributionChartProps) {
  const total = sqlInjectionBlocks + xssBlocks;
  const data = [
    { name: "SQL Injection", value: sqlInjectionBlocks, color: SQL_COLOR },
    { name: "XSS", value: xssBlocks, color: XSS_COLOR },
  ];

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        Phân bố tấn công
      </h2>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          Chưa có tấn công nào được ghi nhận.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative size-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="65%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-black dark:text-zinc-50">
                {total}
              </span>
              <span className="text-[10px] text-zinc-500">Tổng tấn công</span>
            </div>
          </div>

          <div className="flex w-full flex-1 flex-col gap-2.5">
            {data.map((entry) => (
              <div
                key={entry.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2 text-black dark:text-zinc-50">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.name}
                </span>
                <span className="tabular-nums text-zinc-500">
                  {entry.value} ({pct(entry.value, total)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
