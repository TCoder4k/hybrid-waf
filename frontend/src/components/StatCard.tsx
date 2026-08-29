interface StatCardProps {
  label: string;
  value: number;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-[#111]">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
