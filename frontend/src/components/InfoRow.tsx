interface InfoRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
}

// Shared label/value row used by the 4 bottom panels (System Status, System
// Info, Quick Stats, Recent Activity).
export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-medium tabular-nums text-black dark:text-zinc-50">
        {value}
      </span>
    </div>
  );
}
