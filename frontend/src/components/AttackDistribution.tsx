interface AttackDistributionProps {
  sqlInjectionBlocks: number;
  xssBlocks: number;
}

// Plain two-bar comparison — no charting library. The SRS asks for "Attack
// Distribution", not any specific chart type, and this needs no new
// frontend dependency (docs/CLAUDE.md §3: don't add libraries without a
// current-phase justification).
export function AttackDistribution({
  sqlInjectionBlocks,
  xssBlocks,
}: AttackDistributionProps) {
  const total = sqlInjectionBlocks + xssBlocks;
  const rows = [
    { label: "SQL Injection", value: sqlInjectionBlocks, color: "bg-red-500" },
    { label: "XSS", value: xssBlocks, color: "bg-amber-500" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-[#111]">
      <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Attack Distribution
      </h2>
      {total === 0 ? (
        <p className="text-sm text-zinc-500">No blocked attacks recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const pct = total === 0 ? 0 : Math.round((row.value / total) * 100);
            return (
              <div key={row.label} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm text-black dark:text-zinc-50">
                  <span>{row.label}</span>
                  <span className="tabular-nums text-zinc-500">
                    {row.value.toLocaleString()} ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-2 rounded-full ${row.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
