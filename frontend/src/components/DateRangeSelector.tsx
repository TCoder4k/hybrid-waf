import { Calendar } from "lucide-react";

export type DateRangeDays = 7 | 14 | 30;

interface DateRangeSelectorProps {
  value: DateRangeDays;
  onChange: (days: DateRangeDays) => void;
}

// A styled native <select> — only 3 fixed options, which doesn't justify
// pulling in a headless-menu dependency, and a native <select> gets
// keyboard/screen-reader accessibility for free.
export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-black/[.12] bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-white/[.2] dark:bg-[#111] dark:text-zinc-300">
      <Calendar size={16} className="text-zinc-400" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as DateRangeDays)}
        className="cursor-pointer bg-transparent outline-none"
      >
        <option value={7}>7 ngày qua</option>
        <option value={14}>14 ngày qua</option>
        <option value={30}>30 ngày qua</option>
      </select>
    </label>
  );
}
