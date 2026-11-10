import Link from "next/link";

import { approveLeaveAction } from "@/app/actions";
import { db } from "@/lib/db";
import { analyseLeaveImpact } from "@/lib/impact";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { datesInMonth, formatMonth, formatShort } from "@/lib/scheduler/calendar";
import { Card, Chip, PageHeader, SeverityChip, SubmitButton } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

const VERDICT = {
  SAFE: {
    label: "Nothing breaks",
    tone: "ok" as const,
    border: "bg-[var(--ok-soft)] text-[var(--ok)] ring-1 ring-inset ring-[var(--ok-line)]",
  },
  COVERED_BY_BACKUP: {
    label: "Needs a stand-in",
    tone: "warn" as const,
    border: "bg-[var(--warn-soft)] text-[var(--warn)] ring-1 ring-inset ring-[var(--warn-line)]",
  },
  BREAKS_COVER: {
    label: "Leaves a client uncovered",
    tone: "crit" as const,
    border: "bg-[var(--crit-soft)] text-[var(--crit)] ring-1 ring-inset ring-[var(--crit-line)]",
  },
};

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; employeeId?: string; date?: string; approved?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? DEFAULT_MONTH;

  const employees = await db.employee.findMany({
    where: { active: true },
    include: { pod: true },
    orderBy: [{ pod: { name: "asc" } }, { name: "asc" }],
  });

  const canAnalyse = Boolean(sp.employeeId && sp.date);
  const impact = canAnalyse
    ? await analyseLeaveImpact(sp.employeeId!, sp.date!).catch((e) => ({ error: String(e) }))
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Handling changes"
        title="Leave request"
        description="Check what a day of leave would do before approving it. Nothing is saved until you approve — this works out the effect first."
      />

      <PageNote>
        <strong>Nothing is saved until you approve.</strong> Pick a person and a date and the
        app rebuilds the entire month with that day off, compares the problems before and
        after, and shows only what genuinely changes. Then it searches for a stand-in &mdash;
        first among people already on that client, then anyone trained on the same service
        elsewhere, then the same team.
      </PageNote>

      {sp.approved && (
        <div className="mb-6 rounded-md border border-[var(--ok)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
          Leave approved and saved. Regenerate the roster from the{" "}
          <Link href={`/?month=${month}`} className="underline">
            dashboard
          </Link>{" "}
          to rebuild the month around it.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title="Request">
          <form method="get" className="flex flex-col gap-3 text-sm">
            <input type="hidden" name="month" value={month} />
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Who
              </span>
              <select
                name="employeeId"
                defaultValue={sp.employeeId ?? ""}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
              >
                <option value="">Choose a person…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.pod.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Which day
              </span>
              <select
                name="date"
                defaultValue={sp.date ?? ""}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
              >
                <option value="">Choose a date…</option>
                {datesInMonth(month).map((d) => (
                  <option key={d} value={d}>
                    {formatShort(d)}
                  </option>
                ))}
              </select>
            </label>

            <SubmitButton>Check the impact</SubmitButton>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            Try <strong>Faisal Khan</strong> on any day to see a client left uncovered, or{" "}
            <strong>Karthik Subramanian</strong> to see a request that is safe to approve.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          {!impact && (
            <Card>
              <p className="text-sm text-[var(--muted)]">
                Pick a person and a date. The app will re-run the whole month with that day off,
                compare the problems before and after, and show only what actually changes.
              </p>
            </Card>
          )}

          {impact && "error" in impact && (
            <Card>
              <p className="text-sm text-[var(--crit)]">{impact.error}</p>
            </Card>
          )}

          {impact && !("error" in impact) && (
            <>
              <div className={`rounded-[var(--radius)] px-5 py-4 ${VERDICT[impact.verdict].border}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[15px] text-current">{VERDICT[impact.verdict].label}</strong>
                  <span className="font-mono text-xs opacity-80">
                    {impact.employeeName} · {formatShort(impact.date)}
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed">{impact.summary}</p>
              </div>

              <Card title="What this would change">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    Must-fix problems now:{" "}
                    <strong className="tabular-nums">{impact.currentHardCount}</strong>
                  </span>
                  <span aria-hidden>&rarr;</span>
                  <span>
                    after approving:{" "}
                    <strong
                      className={`tabular-nums ${
                        impact.projectedHardCount > impact.currentHardCount
                          ? "text-[var(--crit)]"
                          : "text-[var(--ok)]"
                      }`}
                    >
                      {impact.projectedHardCount}
                    </strong>
                  </span>
                </div>

                {impact.newViolations.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--ok)]">
                    Nothing breaks for {impact.employeeName} or the clients they cover.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {impact.newViolations.map((v, i) => (
                      <li
                        key={i}
                        className="rounded border border-[var(--line)] px-3 py-2 text-sm"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <SeverityChip severity={v.severity} />
                          <span className="font-mono text-xs text-[var(--muted)]">
                            {v.date ? formatShort(v.date) : "whole month"}
                          </span>
                        </div>
                        <p className="leading-relaxed">{v.message}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {(impact.knockOnViolations.length > 0 ||
                  impact.resolvedViolations.length > 0) && (
                  <details className="mt-4 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2">
                    <summary className="cursor-pointer text-sm text-[var(--muted)]">
                      Elsewhere in the month:{" "}
                      <strong className="text-[var(--ink)]">
                        {impact.knockOnViolations.length} new
                      </strong>
                      ,{" "}
                      <strong className="text-[var(--ink)]">
                        {impact.resolvedViolations.length} resolved
                      </strong>
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                      Approving rebuilds the whole month, and the scheduler re-optimises
                      everybody at once &mdash; so other people&rsquo;s days off shift around.
                      That is reshuffling rather than damage, and it is largely offset by the
                      warnings that disappear. None of it involves{" "}
                      {impact.employeeName} or the clients they cover.
                    </p>
                    {impact.knockOnViolations.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {impact.knockOnViolations.slice(0, 8).map((v, i) => (
                          <li key={i} className="text-xs text-[var(--muted)]">
                            {v.message}
                          </li>
                        ))}
                        {impact.knockOnViolations.length > 8 && (
                          <li className="text-xs text-[var(--faint)]">
                            …and {impact.knockOnViolations.length - 8} more
                          </li>
                        )}
                      </ul>
                    )}
                  </details>
                )}
              </Card>

              {impact.affectedLines.length > 0 && (
                <Card title="Lines of work operating that day">
                  <ul className="flex flex-col divide-y divide-[var(--line)]">
                    {impact.affectedLines.map((line) => (
                      <li key={line.brandProcessId} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{line.label}</span>
                          {line.stillCovered ? (
                            <Chip tone="ok">
                              {line.coverWithout} on duty, {line.minStaff} needed
                            </Chip>
                          ) : (
                            <Chip tone="crit">
                              {line.coverWithout} on duty, {line.minStaff} needed
                            </Chip>
                          )}
                        </div>

                        {line.backups.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {line.backups.map((b) => (
                              <li key={b.employeeId} className="text-sm">
                                <Link
                                  href={`/roster/employee/${b.employeeId}?month=${month}`}
                                  className="text-[var(--accent)] hover:underline"
                                >
                                  {b.name}
                                </Link>{" "}
                                <span className="text-[var(--muted)]">{b.rationale}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {!line.stillCovered && line.backups.length === 0 && (
                          <p className="mt-1.5 text-sm text-[var(--crit)]">
                            Nobody else is trained on this work and free that day. This gap cannot
                            be closed by rescheduling.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card title="Decide">
                <div className="flex flex-wrap items-center gap-3">
                  <form action={approveLeaveAction} className="flex items-center gap-2">
                    <input type="hidden" name="employeeId" value={impact.employeeId} />
                    <input type="hidden" name="date" value={impact.date} />
                    <input type="hidden" name="month" value={month} />
                    <select
                      name="type"
                      defaultValue="PLANNED"
                      className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                    >
                      <option value="PLANNED">Planned leave</option>
                      <option value="COMP_OFF">Comp-off</option>
                      <option value="SICK">Sick leave</option>
                    </select>
                    <SubmitButton
                      variant={impact.verdict === "BREAKS_COVER" ? "secondary" : "primary"}
                    >
                      {impact.verdict === "BREAKS_COVER"
                        ? "Approve anyway"
                        : "Approve"}
                    </SubmitButton>
                  </form>

                  <Link
                    href={`/leave?month=${month}`}
                    className="text-sm text-[var(--muted)] hover:underline"
                  >
                    Decline
                  </Link>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                  Approving is allowed even when it leaves a client uncovered. The app&rsquo;s job
                  is to make the consequence visible, not to overrule the manager &mdash; the
                  resulting gap stays on the problem list until it is dealt with.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
