import Link from "next/link";
import { notFound } from "next/navigation";

import { editDayAction, unlockDayAction } from "@/app/actions";
import { db } from "@/lib/db";
import { DEFAULT_MONTH, getRoster } from "@/lib/roster-service";
import { datesInMonth, formatMonth, formatShort, weekdayOf } from "@/lib/scheduler/calendar";
import { Card, Chip, DAY_STATE, EmptyState, PageHeader, SubmitButton, type DayState } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function EmployeeRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; edited?: string }>;
}) {
  const { id } = await params;
  const { month = DEFAULT_MONTH, edited } = await searchParams;

  const [employee, roster, holidays] = await Promise.all([
    db.employee.findUnique({
      where: { id },
      include: {
        pod: true,
        assignments: {
          include: { brandProcess: { include: { brand: true, process: true } } },
        },
      },
    }),
    getRoster(month),
    db.holiday.findMany({ where: { date: { startsWith: month } } }),
  ]);

  if (!employee) notFound();

  const holidayMap = Object.fromEntries(holidays.map((h) => [h.date, h.name]));
  const myDays = (roster?.days ?? []).filter((d) => d.employeeId === employee.id);
  const byDate = new Map(myDays.map((d) => [d.date, d]));

  const working = myDays.filter((d) => d.state === "WORKING").length;
  const off = myDays.length - working;

  const ownedLines = employee.assignments.filter((a) => a.isPrimary);
  const backupLines = employee.assignments.filter((a) => !a.isPrimary);

  return (
    <>
      <PageHeader
        eyebrow={`${employee.pod.name} team${employee.isPodLead ? " · team lead" : ""}`}
        title={employee.name}
        description={
          <>
            Prefers <strong>{DAY_NAMES[employee.preferredWeeklyOff]}</strong> off. Runs{" "}
            {ownedLines.length} client {ownedLines.length === 1 ? "job" : "jobs"}
            {backupLines.length > 0 && <>, and can cover {backupLines.length} more</>}.
            {roster && (
              <>
                {" "}
                Working {working} of {myDays.length} days in {formatMonth(month)}.
              </>
            )}
          </>
        }
        actions={
          <Link
            href={`/employees?month=${month}`}
            className="inline-flex items-center rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            All staff
          </Link>
        }
      />

      <PageNote>
        <strong>Every single day carries a reason.</strong> That is the point of this screen
        &mdash; if somebody asks &ldquo;why am I working that Sunday?&rdquo;, the answer is
        written down rather than reconstructed. Use <strong>Change</strong> on any day to
        override it; doing so locks that day so rebuilding the schedule will not undo it.
      </PageNote>

      {edited && (
        <div className="mb-6 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent)]">
          Saved and locked. Regenerate the roster from the dashboard to see what this change
          affects elsewhere.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          {!roster ? (
            <EmptyState title={`No roster generated for ${formatMonth(month)}`} />
          ) : (
            <Card
              title={`${formatMonth(month)} — ${working} working, ${off} off`}
              footer="Use Change on any day to override it. That locks the day, so rebuilding the schedule leaves it alone."
            >
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {datesInMonth(month).map((date) => {
                  const day = byDate.get(date);
                  if (!day) return null;
                  const look = DAY_STATE[day.state as DayState];
                  const isHoliday = Boolean(holidayMap[date]);

                  return (
                    <li key={date} className="flex flex-wrap items-start gap-3 py-2">
                      <div
                        className={`mt-0.5 flex h-6 w-7 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] ${look.className} ${
                          day.isLocked ? "ring-1 ring-inset ring-[var(--accent)]" : ""
                        }`}
                      >
                        {look.letter}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs tabular-nums text-[var(--muted)]">
                            {formatShort(date)}
                          </span>
                          <span className="text-sm font-medium">{look.label}</span>
                          {day.isLocked && <Chip tone="accent">set by hand</Chip>}
                          {isHoliday && <Chip>{holidayMap[date]}</Chip>}
                          {weekdayOf(date) === 0 && <Chip>Sunday</Chip>}
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">
                          {day.reason}
                        </p>
                      </div>

                      <details className="shrink-0">
                        <summary className="cursor-pointer rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)]">
                          Change
                        </summary>
                        <form
                          action={editDayAction}
                          className="mt-2 flex flex-col gap-2 rounded border border-[var(--line)] bg-[var(--surface-2)] p-3"
                        >
                          <input type="hidden" name="rosterDayId" value={day.id} />
                          <input type="hidden" name="month" value={month} />
                          <label className="text-xs text-[var(--muted)]">
                            Set to
                            <select
                              name="state"
                              defaultValue={day.state}
                              className="ml-2 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
                            >
                              <option value="WORKING">Working</option>
                              <option value="WEEKLY_OFF">Weekly off</option>
                              <option value="LEAVE">Leave</option>
                              <option value="COMP_OFF">Comp-off</option>
                            </select>
                          </label>
                          <input
                            type="text"
                            name="note"
                            placeholder="Why? (optional)"
                            className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm"
                          />
                          <SubmitButton>Save and lock</SubmitButton>
                        </form>
                        {day.isLocked && (
                          <form action={unlockDayAction} className="mt-2">
                            <input type="hidden" name="rosterDayId" value={day.id} />
                            <input type="hidden" name="month" value={month} />
                            <SubmitButton variant="secondary">Release lock</SubmitButton>
                          </form>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Runs these client jobs">
            {ownedLines.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Runs none directly.{" "}
                {employee.isPodLead && "Team leads are kept free to cover for others."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {ownedLines.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/roster/brand/${a.brandProcess.brandId}?month=${month}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {a.brandProcess.brand.name}
                    </Link>
                    <span className="ml-1.5 text-[var(--muted)]">
                      {a.brandProcess.process.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {backupLines.length > 0 && (
            <Card title="Can cover these">
              <ul className="flex flex-col gap-2 text-sm">
                {backupLines.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/roster/brand/${a.brandProcess.brandId}?month=${month}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {a.brandProcess.brand.name}
                    </Link>
                    <span className="ml-1.5 text-[var(--muted)]">
                      {a.brandProcess.process.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
