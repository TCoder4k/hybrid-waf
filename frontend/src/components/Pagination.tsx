import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];
// How many numbered page buttons to show at once, centered on the current
// page — simple sliding window rather than an ellipsis-based scheme, which
// is plenty for an internal admin tool's event volumes.
const WINDOW_SIZE = 5;

function pageWindow(page: number, pageCount: number): number[] {
  const half = Math.floor(WINDOW_SIZE / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(pageCount, start + WINDOW_SIZE - 1);
  start = Math.max(1, end - WINDOW_SIZE + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }
  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[.08] pt-3 text-sm dark:border-white/[.145]">
      <p className="text-zinc-500">Tổng {total.toLocaleString()} sự kiện</p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Trang trước"
          className="flex size-8 items-center justify-center rounded-md border border-black/[.12] text-zinc-600 hover:bg-black/[.04] disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
        >
          <ChevronLeft size={16} />
        </button>

        {pageWindow(page, pageCount).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`flex size-8 items-center justify-center rounded-md text-xs font-medium ${
              p === page
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-black/[.12] text-zinc-600 hover:bg-black/[.04] dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
            }`}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Trang sau"
          className="flex size-8 items-center justify-center rounded-md border border-black/[.12] text-zinc-600 hover:bg-black/[.04] disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/[.2] dark:text-zinc-300 dark:hover:bg-white/[.08]"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <label className="flex items-center gap-2 text-zinc-500">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="cursor-pointer rounded-md border border-black/[.12] bg-white px-2 py-1 text-zinc-700 outline-none dark:border-white/[.2] dark:bg-[#111] dark:text-zinc-300"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / trang
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
