import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { DEFAULT_MONTH, getRoster } from "@/lib/roster-service";
import {
  datesInMonth,
  describeCalendar,
  describeMinStaff,
  formatMonth,
  formatShort,
  isOperatingDay,
  minStaffOn,
} from "@/lib/scheduler/calendar";
import { Card, Chip, EmptyState, PageHeader, Scroller } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

/**
 * One kind of work, across every brand that buys it.
 *
 * This is the view that answers "who can cover support tomorrow?" regardless
 * of which client they normally serve -- which is exactly the question asked
 * when looking for a backup.
 */
export default async function ProcessRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month = DEFAULT_MONTH } = await searchParams;

  const [process, roster, holidays] = await Promise.all([
    db.process.findUnique({
      where: { id },
      include: {
        brandProcesses: {
          where: { active: true, brand: { active: true } },
          include: {
            brand: true,
            assignments: { include: { employee: true }, orderBy: { isPrimary: "desc" } },
          },
          orderBy: { brand: { name: "asc" } },
        },
      },
    }),
    getRoster(month),
    db.holiday.findMany({ where: { date: { startsWith: month } } }),
  ]);

  if (!process) notFound();

  const holidayMap = Object.fromEntries(holidays.map((h) => [h.date, h.name]));
  const dates = datesInMonth(month);

  const workingOn = new Map<string, Set<string>>();
  for (const d of roster?.days ?? []) {
    if (d.state !== "WORKING") continue;
    if (!workingOn.has(d.date)) workingOn.set(d.date, new Set());
    workingOn.get(d.date)!.add(d.employeeId);
  }

  const everyone = new Set(
    process.brandProcesses.flatMap((bp) => bp.assignments.map((a) => a.employeeId))
  );

  return (
    <>
      <PageHeader
        eyebrow="Type of work"
        title={process.name}
        description={
          <>
            {process.description} &middot; bought by {process.brandProcesses.length}{" "}
            {process.brandProcesses.length === 1 ? "client" : "clients"} &middot; {everyone.size}{" "}
            people trained on it.
          </>
        }
        actions={
          <Link
            href={`/processes?month=${month}`}
            className="inline-flex items-center rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            All types of work
          </Link>
        }
      />

      <PageNote>
        One service, shown across every client that buys it. The same service often runs on a
        different calendar at each client, which is exactly why the app stores schedules per
        client-and-service rather than per client. The list of people at the bottom is where it
        searches first when a gap needs covering.
      </PageNote>

      {!roster && (
        <div className="mb-6">
          <EmptyState title={`No roster generated for ${formatMonth(month)}`} />
        </div>
      )}

      <Card
        title={`Daily staffing — ${formatMonth(month)}`}
        footer="A dash means that brand is closed that day. A red ! means fewer people on duty than the contract requires."
      >
        <Scroller>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[200px] border-b-2 border-[var(--ink)] bg-[var(--surface)] py-2 pr-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Brand
                </th>
                {dates.map((d) => (
                  <th
                    key={d}
                    className="border-b-2 border-[var(--ink)] px-0 py-2 text-center font-mono text-[10px] font-normal text-[var(--muted)]"
                  >
                    <div className="w-7 tabular-nums">{d.slice(8)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {process.brandProcesses.map((bp) => {
                const staffIds = bp.assignments.map((a) => a.employeeId);
                const staff = bp.assignments.map((a) => a.employee);
                return (
                  <tr key={bp.id} className="hover:bg-[var(--surface-2)]">
                    <th className="sticky left-0 z-10 border-b border-[var(--line)] bg-[var(--surface)] py-1.5 pr-3 text-left font-normal">
                      <Link
                        href={`/roster/brand/${bp.brandId}?month=${month}`}
                        className="hover:underline"
                      >
                        {bp.brand.name}
                      </Link>
                      <div className="font-mono text-[10px] text-[var(--muted)]">
                        {describeCalendar(bp)} &middot; {describeMinStaff(bp)}
                      </div>
                    </th>
                    {dates.map((date) => {
                      const open = isOperatingDay(bp, date, holidayMap);
                      const have = open
                        ? staffIds.filter((sid) => workingOn.get(date)?.has(sid)).length
                        : 0;
                      const needed = open ? minStaffOn(bp, date) : 0;
                      const short = open && have < needed;
                      const onDuty = open
                        ? staff.filter((s) => workingOn.get(date)?.has(s.id))
                        : [];
                      const away = open
                        ? staff.filter((s) => !workingOn.get(date)?.has(s.id))
                        : [];
                      return (
                        <td key={date} className="border-b border-[var(--line)] p-0.5">
                          <div
                            title={
                              open
                                ? [
                                    `${bp.brand.name} — ${formatShort(date)}`,
                                    `${have} on duty, ${needed} needed`,
                                    ``,
                                    onDuty.length
                                      ? `On duty: ${onDuty.map((s) => s.name).join(", ")}`
                                      : `On duty: nobody`,
                                    away.length
                                      ? `Off: ${away.map((s) => s.name).join(", ")}`
                                      : ``,
                                  ]
                                    .filter(Boolean)
                                    .join("\n")
                                : `${bp.brand.name} — ${formatShort(date)}\nClosed`
                            }
                            className={`tnum flex h-[22px] w-[26px] items-center justify-center rounded text-[11px] font-semibold ${
                              !open
                                ? "bg-[var(--surface-3)] text-[var(--faint)]"
                                : short
                                  ? "bg-[var(--crit-soft)] text-[var(--crit)] ring-1 ring-inset ring-[var(--crit-line)]"
                                  : "bg-[var(--ok-soft)] text-[var(--ok)] ring-1 ring-inset ring-[var(--ok-line)]"
                            }`}
                          >
                            {!open ? "–" : short ? "!" : have}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>
      </Card>

      <div className="mt-6">
        <Card title="Everyone trained on this">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {[...everyone].map((eid) => {
              const a = process.brandProcesses
                .flatMap((bp) => bp.assignments)
                .find((x) => x.employeeId === eid)!;
              return (
                <Link
                  key={eid}
                  href={`/roster/employee/${eid}?month=${month}`}
                  className="hover:underline"
                >
                  {a.employee.name}
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            When a brand loses cover, the backup search looks through this list first &mdash;
            people already trained on {process.name} elsewhere.
          </p>
        </Card>
      </div>
    </>
  );
}
