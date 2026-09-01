import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-2 border-t border-black/[.08] px-6 py-4 text-xs text-zinc-500 sm:flex-row dark:border-white/[.145]">
      <span>© 2026 Hybrid WAF. All rights reserved.</span>
      <span className="flex items-center gap-1.5">
        <Shield size={14} />
        Bảo vệ ứng dụng web của bạn
      </span>
    </footer>
  );
}
