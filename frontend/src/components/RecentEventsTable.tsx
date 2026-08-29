import type { SecurityEvent } from "@/lib/api";

interface RecentEventsTableProps {
  events: SecurityEvent[];
}

export function RecentEventsTable({ events }: RecentEventsTableProps) {
  return (
    <div className="rounded-lg border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-[#111]">
      <h2 className="mb-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Recent Security Events
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">No blocked requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-500 dark:border-white/[.145]">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Attack Type</th>
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 pr-4 font-medium">Endpoint</th>
                <th className="py-2 pr-4 font-medium">Confidence</th>
                <th className="py-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-black/[.05] last:border-0 dark:border-white/[.08]"
                >
                  <td className="py-2 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 font-medium text-black dark:text-zinc-50">
                    {event.attackType}
                  </td>
                  <td className="py-2 pr-4">{event.method}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{event.endpoint}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {event.confidence !== null
                      ? event.confidence.toFixed(2)
                      : "—"}
                  </td>
                  <td className="py-2">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      {event.decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
