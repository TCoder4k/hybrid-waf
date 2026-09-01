import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/Card";

export type StatCardColor =
  | "blue"
  | "green"
  | "red"
  | "purple"
  | "orange"
  | "gray";

interface StatCardProps {
  label: string;
  value: number;
  subtitle: string;
  percentage: string;
  icon: LucideIcon;
  iconColor: StatCardColor;
  pillColor: StatCardColor;
}

// Tailwind's JIT compiler only picks up class names it can find literally in
// source, so this must be a lookup of fully-written class strings — not a
// `bg-${color}-100` template, which it can't statically discover.
const COLOR_CLASSES: Record<
  StatCardColor,
  { iconBg: string; iconText: string; pillBg: string; pillText: string }
> = {
  blue: {
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconText: "text-blue-600 dark:text-blue-300",
    pillBg: "bg-blue-50 dark:bg-blue-900/30",
    pillText: "text-blue-700 dark:text-blue-300",
  },
  green: {
    iconBg: "bg-green-50 dark:bg-green-900/30",
    iconText: "text-green-600 dark:text-green-300",
    pillBg: "bg-green-50 dark:bg-green-900/30",
    pillText: "text-green-700 dark:text-green-300",
  },
  red: {
    iconBg: "bg-red-50 dark:bg-red-900/30",
    iconText: "text-red-600 dark:text-red-300",
    pillBg: "bg-red-50 dark:bg-red-900/30",
    pillText: "text-red-700 dark:text-red-300",
  },
  purple: {
    iconBg: "bg-purple-50 dark:bg-purple-900/30",
    iconText: "text-purple-600 dark:text-purple-300",
    pillBg: "bg-purple-50 dark:bg-purple-900/30",
    pillText: "text-purple-700 dark:text-purple-300",
  },
  orange: {
    iconBg: "bg-orange-50 dark:bg-orange-900/30",
    iconText: "text-orange-600 dark:text-orange-300",
    pillBg: "bg-orange-50 dark:bg-orange-900/30",
    pillText: "text-orange-700 dark:text-orange-300",
  },
  gray: {
    iconBg: "bg-zinc-100 dark:bg-zinc-800",
    iconText: "text-zinc-600 dark:text-zinc-300",
    pillBg: "bg-zinc-100 dark:bg-zinc-800",
    pillText: "text-zinc-600 dark:text-zinc-300",
  },
};

export function StatCard({
  label,
  value,
  subtitle,
  percentage,
  icon: Icon,
  iconColor,
  pillColor,
}: StatCardProps) {
  const iconClasses = COLOR_CLASSES[iconColor];
  const pillClasses = COLOR_CLASSES[pillColor];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span
          className={`flex size-9 items-center justify-center rounded-lg ${iconClasses.iconBg} ${iconClasses.iconText}`}
        >
          <Icon size={18} />
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillClasses.pillBg} ${pillClasses.pillText}`}
        >
          {percentage}
        </span>
      </div>
      <div>
        <p className="text-sm text-zinc-500">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
          {value.toLocaleString()}
        </p>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
    </Card>
  );
}
