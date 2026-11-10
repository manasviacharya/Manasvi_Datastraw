import Link from "next/link";

import { datesInMonth, formatShort, weekdayOf } from "@/lib/scheduler/calendar";
import { DAY_STATE, type DayState } from "./ui";

export type GridRow = {
  employeeId: string;
  name: string;
  code: string;
  podName: string;
  isPodLead: boolean;
  /** date -> state */
  byDate: Map<string, { state: DayState; reason: string; isLocked: boolean }>;
};

/**
 * The roster grid: people down the side, days across the top.
 *
 * Rendered entirely on the server. A 32 x 31 grid is 992 cells, and making
 * each one an interactive client component would ship a great deal of
 * JavaScript to reimplement the title attribute, which the browser already
 * does for free.
 *
 * Weekends get a tinted column so the eye can find the week boundaries
 * without counting, which is most of what makes a month-long grid readable.
 */
export function RosterGrid({
  month,
  rows,
  holidays,
  emptyMessage = "No one to show.",
}: {
  month: string;
  rows: GridRow[];
  holidays: Record<string, string>;
  emptyMessage?: string;
}) {
  const dates = datesInMonth(month);

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-[var(--muted)]">{emptyMessage}</p>;
  }

  // Group rows by team so the grid has horizontal structure instead of being
  // 32 undifferentiated stripes.
  const groups: { pod: string; rows: GridRow[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.pod === row.podName) last.rows.push(row);
    else groups.push({ pod: row.podName, rows: [row] });
  }

  const DOW = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="scroll-x">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-[200px] border-b border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2.5 text-left"
            >
              <span className="label">Staff member</span>
            </th>
            {dates.map((d) => {
              const dow = weekdayOf(d);
              const holiday = holidays[d];
              const quiet = dow === 0 || dow === 6 || Boolean(holiday);
              return (
                <th
                  key={d}
                  scope="col"
                  title={holiday ? `${formatShort(d)} — ${holiday}` : formatShort(d)}
                  className={`border-b border-[var(--line-strong)] px-0 pb-2 pt-2.5 text-center font-normal ${
                    quiet ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]"
                  }`}
                >
                  <div className="w-[26px]">
                    <div
                      className={`text-[9.5px] uppercase ${
                        holiday ? "font-semibold text-[var(--warn)]" : "text-[var(--faint)]"
                      }`}
                    >
                      {DOW[dow]}
                    </div>
                    <div className="tnum text-[11.5px] font-medium text-[var(--ink-2)]">
                      {d.slice(8)}
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {groups.map((group) => (
          <tbody key={group.pod}>
            {/* Team divider */}
            <tr>
              <th
                scope="colgroup"
                colSpan={dates.length + 1}
                className="sticky left-0 z-10 bg-[var(--surface-2)] px-3 py-1 text-left"
              >
                <span className="label">{group.pod} team</span>
              </th>
            </tr>

            {group.rows.map((row) => (
              <tr key={row.employeeId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-left font-normal transition-colors group-hover:bg-[var(--accent-soft)]"
                >
                  <Link
                    href={`/roster/employee/${row.employeeId}?month=${month}`}
                    className="text-[13.5px] font-medium text-[var(--ink)] no-underline hover:text-[var(--accent)] hover:underline"
                  >
                    {row.name}
                  </Link>
                  {row.isPodLead && (
                    <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--faint)]">
                      lead
                    </span>
                  )}
                </th>

                {dates.map((d) => {
                  const cell = row.byDate.get(d);
                  const dow = weekdayOf(d);
                  const quiet = dow === 0 || dow === 6 || Boolean(holidays[d]);

                  if (!cell) {
                    return (
                      <td
                        key={d}
                        className={`border-b border-[var(--line)] p-[2px] ${quiet ? "bg-[var(--surface-2)]" : ""}`}
                      >
                        <div className="h-[22px] w-[26px] rounded bg-[var(--surface-3)]" />
                      </td>
                    );
                  }

                  const look = DAY_STATE[cell.state];
                  return (
                    <td
                      key={d}
                      className={`border-b border-[var(--line)] p-[2px] transition-colors group-hover:bg-[var(--accent-soft)] ${
                        quiet ? "bg-[var(--surface-2)]" : ""
                      }`}
                    >
                      <div
                        title={`${row.name} — ${formatShort(d)}\n${look.label}${
                          cell.isLocked ? " (set by hand)" : ""
                        }\n\n${cell.reason}`}
                        className={`flex h-[22px] w-[26px] cursor-help items-center justify-center rounded text-[11px] font-semibold ${look.className} ${
                          cell.isLocked
                            ? "outline outline-2 outline-offset-[-2px] outline-[var(--accent)]"
                            : ""
                        }`}
                      >
                        {look.letter}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Shape rows for the grid from flat RosterDay records. */
export function buildRows(
  employees: {
    id: string;
    name: string;
    code: string;
    isPodLead: boolean;
    pod: { name: string };
  }[],
  days: { employeeId: string; date: string; state: string; reason: string; isLocked: boolean }[]
): GridRow[] {
  const byEmployee = new Map<string, GridRow>();

  for (const e of employees) {
    byEmployee.set(e.id, {
      employeeId: e.id,
      name: e.name,
      code: e.code,
      podName: e.pod.name,
      isPodLead: e.isPodLead,
      byDate: new Map(),
    });
  }

  for (const d of days) {
    byEmployee.get(d.employeeId)?.byDate.set(d.date, {
      state: d.state as DayState,
      reason: d.reason,
      isLocked: d.isLocked,
    });
  }

  return [...byEmployee.values()];
}
