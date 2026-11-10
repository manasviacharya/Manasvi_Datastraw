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
  weekdayOf,
} from "@/lib/scheduler/calendar";
import { Card, Chip, EmptyState, PageHeader, Scroller } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

export default async function BrandRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month = DEFAULT_MONTH } = await searchParams;

  const [brand, roster, holidays] = await Promise.all([
    db.brand.findUnique({
      where: { id },
      include: {
        ownerPod: true,
        brandProcesses: {
          where: { active: true },
          include: {
            process: true,
            assignments: { include: { employee: true }, orderBy: { isPrimary: "desc" } },
          },
          orderBy: { process: { code: "asc" } },
        },
      },
    }),
    getRoster(month),
    db.holiday.findMany({ where: { date: { startsWith: month } } }),
  ]);

  if (!brand) notFound();

  const holidayMap = Object.fromEntries(holidays.map((h) => [h.date, h.name]));
  const dates = datesInMonth(month);

  // Who is working on each date, from the saved roster.
  const workingOn = new Map<string, Set<string>>();
  for (const d of roster?.days ?? []) {
    if (d.state !== "WORKING") continue;
    if (!workingOn.has(d.date)) workingOn.set(d.date, new Set());
    workingOn.get(d.date)!.add(d.employeeId);
  }

  const owners = new Set(
    brand.brandProcesses.flatMap((bp) =>
      bp.assignments.filter((a) => a.isPrimary).map((a) => a.employeeId)
    )
  );

  return (
    <>
      <PageHeader
        eyebrow="Brand"
        title={brand.name}
        description={
          <>
            Buys {brand.brandProcesses.length}{" "}
            {brand.brandProcesses.length === 1 ? "service" : "services"}
            {brand.ownerPod && <> &middot; {brand.ownerPod.name} team</>} &middot;{" "}
            {owners.size === 1 ? (
              <strong>owned by one person</strong>
            ) : (
              <>owned by {owners.size} people</>
            )}
. Each service runs on its own calendar.
          </>
        }
        actions={
          <Link
            href={`/brands?month=${month}`}
            className="inline-flex items-center rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            All brands
          </Link>
        }
      />

      <PageNote>
        <strong>This is the view a client would care about.</strong> For every day of the month
        it shows how many people were actually on duty against how many the contract requires.
        A dash means the client is closed that day. A red{" "}
        <strong>!</strong> means fewer people than promised.
      </PageNote>

      {!roster && (
        <div className="mb-6">
          <EmptyState title={`No roster generated for ${formatMonth(month)}`}>
            <p>Coverage below is based on the calendar only, with nobody scheduled yet.</p>
          </EmptyState>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {brand.brandProcesses.map((bp) => {
          const staff = bp.assignments.map((a) => a.employee);
          const staffIds = staff.map((s) => s.id);

          const perDay = dates.map((date) => {
            const open = isOperatingDay(bp, date, holidayMap);
            // Names, not just a count. "2 on duty" does not tell a manager
            // whether the right two are on duty, and the brief asks the
            // interface to make it easy to see WHO is working on a given day.
            const onDuty = open ? staff.filter((s) => workingOn.get(date)?.has(s.id)) : [];
            const away = open ? staff.filter((s) => !workingOn.get(date)?.has(s.id)) : [];
            return {
              date,
              open,
              have: onDuty.length,
              need: open ? minStaffOn(bp, date) : 0,
              onDuty,
              away,
            };
          });

          const openDays = perDay.filter((d) => d.open);
          const gaps = openDays.filter((d) => d.have < d.need);

          return (
            <Card
              key={bp.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--ink)]">{bp.process.name}</span>
                  <Chip tone="accent">{describeCalendar(bp)}</Chip>
                  <Chip>{describeMinStaff(bp)}</Chip>
                  {gaps.length === 0 ? (
                    <Chip tone="ok">fully covered</Chip>
                  ) : (
                    <Chip tone="crit">
                      {gaps.length} {gaps.length === 1 ? "day" : "days"} uncovered
                    </Chip>
                  )}
                </span>
              }
              footer={
                <>
                  Open {openDays.length} {openDays.length === 1 ? "day" : "days"} this month
                  {bp.notes && <> &middot; {bp.notes}</>}
                </>
              }
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Covered by
                </span>
                {staff.map((s, i) => (
                  <Link
                    key={s.id}
                    href={`/roster/employee/${s.id}?month=${month}`}
                    className="hover:underline"
                  >
                    {s.name}
                    {bp.assignments[i].isPrimary ? (
                      <span className="ml-1 font-mono text-[10px] text-[var(--muted)]">owner</span>
                    ) : (
                      <span className="ml-1 font-mono text-[10px] text-[var(--muted)]">backup</span>
                    )}
                  </Link>
                ))}
              </div>

              <Scroller>
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">
                    Daily coverage for {brand.name} {bp.process.name}
                  </caption>
                  <thead>
                    <tr>
                      <th className="border-b-2 border-[var(--ink)] py-1.5 pr-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                        Day
                      </th>
                      {dates.map((d) => (
                        <th
                          key={d}
                          className="border-b-2 border-[var(--ink)] px-0 py-1.5 text-center font-mono text-[10px] font-normal text-[var(--muted)]"
                        >
                          <div className="w-7 tabular-nums">{d.slice(8)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th className="whitespace-nowrap border-b border-[var(--line)] py-1.5 pr-3 text-left font-normal text-[var(--muted)]">
                        On duty / needed
                      </th>
                      {perDay.map(({ date, open, have, need, onDuty, away }) => {
                        const label = !open
                          ? `${formatShort(date)}\nClosed${holidayMap[date] ? ` — ${holidayMap[date]}` : ""}`
                          : [
                              `${formatShort(date)} — ${have} on duty, ${need} needed`,
                              ``,
                              onDuty.length
                                ? `On duty: ${onDuty.map((s) => s.name).join(", ")}`
                                : `On duty: nobody`,
                              away.length ? `Off: ${away.map((s) => s.name).join(", ")}` : ``,
                            ]
                              .filter(Boolean)
                              .join("\n");
                        const tone = !open
                          ? "bg-[var(--surface-3)] text-[var(--faint)]"
                          : have < need
                            ? "bg-[var(--crit-soft)] text-[var(--crit)] ring-1 ring-inset ring-[var(--crit-line)]"
                            : "bg-[var(--ok-soft)] text-[var(--ok)] ring-1 ring-inset ring-[var(--ok-line)]";
                        return (
                          <td key={date} className="border-b border-[var(--line)] p-0.5">
                            <div
                              title={label}
                              className={`tnum flex h-[22px] w-[26px] items-center justify-center rounded text-[11px] font-semibold ${tone}`}
                            >
                              {!open ? "–" : have < need ? "!" : have}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </Scroller>

              {gaps.length > 0 && (
                <div className="mt-3 rounded border border-[var(--crit)] bg-[var(--crit-soft)] px-3 py-2 text-sm text-[var(--crit)]">
                  <strong>Uncovered:</strong>{" "}
                  {gaps.map((g) => formatShort(g.date)).join(", ")}.{" "}
                  <Link href={`/conflicts?month=${month}`} className="underline">
                    See why
                  </Link>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
