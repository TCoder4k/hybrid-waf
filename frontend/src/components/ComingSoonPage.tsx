import { Construction } from "lucide-react";
import { Card } from "@/components/Card";

interface ComingSoonPageProps {
  title: string;
  description?: string;
}

// Shared placeholder for the 5 sidebar destinations that aren't part of
// this task's scope (only "Tổng quan" is a fully real page) — a clean,
// honest "not built yet" card rather than a 404 or a page pretending to
// have functionality nothing else in the app defines.
export function ComingSoonPage({
  title,
  description = "Tính năng này đang được phát triển.",
}: ComingSoonPageProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-bold text-black dark:text-zinc-50">
        {title}
      </h1>
      <Card className="mt-4 flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Construction size={22} />
        </span>
        <p className="text-sm text-zinc-500">{description}</p>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Sắp ra mắt
        </span>
      </Card>
    </div>
  );
}
