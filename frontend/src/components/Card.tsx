interface CardProps {
  children: React.ReactNode;
  className?: string;
}

// Shared card surface — factors out the border/background styling that used
// to be copy-pasted across StatCard/AttackDistribution/RecentEventsTable.
// Deliberately no built-in header/title slot: the cards in this dashboard
// vary too much (some have a "Xem tất cả" link, some a subtitle, some
// nothing) to be worth over-abstracting — each consumer renders its own
// header markup inside.
export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#111] ${className}`}
    >
      {children}
    </div>
  );
}
