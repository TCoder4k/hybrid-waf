interface PageHeaderProps {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-black dark:text-zinc-50">
          {title}
        </h1>
        <p className="text-sm text-zinc-500">{subtitle}</p>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
