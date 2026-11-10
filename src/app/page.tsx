import Link from "next/link";

import { generateRosterAction, publishRosterAction } from "./actions";
import { db } from "@/lib/db";
import { DEFAULT_MONTH, getRosterSummary, selectableMonths } from "@/lib/roster-service";
import { formatMonth } from "@/lib/scheduler/calendar";
import { GuidedTour, WhatIsThis } from "@/components/explainer";
import { Banner, Card, Chip, EmptyState, PageHeader, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; published?: string }>;
}) {
  const params = await searchParams;
  const month = params.month ?? DEFAULT_MONTH;

  const [summary, counts] = await Promise.all([
    getRosterSummary(month),
    Promise.all([
      db.employee.count({ where: { active: true } }),
      db.brand.count({ where: { active: true } }),
      db.brandProcess.count({ where: { active: true } }),
      db.pod.count(),
      db.leave.count({ where: { status: "APPROVED", date: { startsWith: month } } }),
      db.holiday.count({ where: { date: { startsWith: month } } }),
    ]),
  ]);

  const [employees, brands, lines, pods, leaveDays, holidays] = counts;

  if (employees === 0) {
    return (
      <>
        <PageHeader title="Staff Roster Planner" />
        <EmptyState title="The database is empty">
          <p>
            Load the sample data with <code className="font-mono">npm run db:seed</code>, then
            reload this page.
          </p>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <header className="mb-10 max-w-3xl">
        <h1>Who works which days next month</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-[var(--muted)]">
          This builds the monthly schedule for a customer-support company &mdash; deciding which
          of its <strong className="text-[var(--ink)]">32 staff</strong> work which days, so that
          all <strong className="text-[var(--ink)]">22 client brands</strong> stay covered. And
          it refuses to pretend a client is covered when they are not.
        </p>
      </header>

      <WhatIsThis />

      {/* ------------------------------------------------------------------ */}
      {/* The control panel                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="mb-10 rounded-[var(--radius)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2>{summary ? `Schedule for ${formatMonth(month)}` : `Build a schedule`}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              {summary ? (
                <>
                  Built from {employees} staff in {pods} teams, covering {lines} jobs across{" "}
                  {brands} client brands. This month has {leaveDays} days of approved leave and{" "}
                  {holidays} public {holidays === 1 ? "holiday" : "holidays"} to work around.
                </>
              ) : (
                <>
                  Pick a month and press the button. It checks whether the month is even
                  possible before it schedules anybody.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <form action={generateRosterAction} className="flex items-end gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="label">Month</span>
                <select name="month" defaultValue={month}>
                  {selectableMonths().map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton>{summary ? "Rebuild schedule" : "Build the schedule"}</SubmitButton>
            </form>

            {summary && summary.status === "DRAFT" && (
              <form action={publishRosterAction}>
                <input type="hidden" name="month" value={month} />
                <SubmitButton
                  variant="secondary"
                  disabled={!summary.canPublish}
                  title={
                    summary.canPublish
                      ? "Publish this schedule to the team"
                      : `Blocked: ${summary.hardCount} serious problems must be resolved first`
                  }
                >
                  Publish
                </SubmitButton>
              </form>
            )}
          </div>
        </div>

        {summary && !summary.canPublish && (
          <div className="mt-4">
            <Banner tone="crit" title="Publishing is blocked on purpose.">
              {summary.hardCount} serious problems are unresolved. A schedule that looks
              finished while a client has nobody on duty is worse than no schedule at all, so
              the button stays disabled until they are dealt with.{" "}
              <Link href={`/conflicts?month=${month}`} className="font-semibold underline">
                See the problems
              </Link>
            </Banner>
          </div>
        )}
      </section>

      {params.published && (
        <div className="mb-8">
          <Banner tone="ok" title="Published.">
            The schedule for {formatMonth(month)} is live for the team.
          </Banner>
        </div>
      )}

      {!summary ? (
        <EmptyState title={`No schedule has been built for ${formatMonth(month)} yet`}>
          <p>Press &ldquo;Build the schedule&rdquo; above to create one.</p>
        </EmptyState>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* How good is it?                                                */}
          {/* -------------------------------------------------------------- */}
          <section className="mb-10">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="label mb-2">Quality</div>
                <h2 className="text-[1.375rem] leading-snug">How good is this schedule?</h2>
              </div>
              <p className="max-w-sm text-[13.5px] text-[var(--muted)]">
                Four measurements, so &ldquo;it produced something&rdquo; is never mistaken for
                &ldquo;it produced something good&rdquo;.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ScoreTile
                label="Clients covered"
                question="Is somebody on duty every day a client is paying for?"
                value={`${summary.scorecard.coveragePct}%`}
                tone={summary.scorecard.coveragePct >= 100 ? "ok" : "crit"}
                verdict={
                  summary.scorecard.coveragePct >= 100
                    ? "Every client day is covered."
                    : "Some client days have nobody. Each one is listed individually."
                }
              />
              <ScoreTile
                label="Staff got their preferred day off"
                question="Did people get the weekday they asked for?"
                value={`${summary.scorecard.preferenceMetPct}%`}
                tone={summary.scorecard.preferenceMetPct >= 60 ? "ok" : "warn"}
                verdict="A request, not a right — it gives way when a client would be left uncovered."
              />
              <ScoreTile
                label="Weekend fairness"
                question="Are Sundays off shared evenly, or dumped on a few people?"
                value={String(summary.scorecard.fairnessSpread)}
                tone={summary.scorecard.fairnessSpread <= 1 ? "ok" : "warn"}
                verdict="Lower is fairer. 0 would mean everyone gets exactly the same number."
              />
              <ScoreTile
                label="Impossible work"
                question="Is any client asking for more days than their staff can physically work?"
                value={`${summary.scorecard.shortfallPersonDays} days`}
                tone={summary.scorecard.shortfallPersonDays === 0 ? "ok" : "crit"}
                verdict={
                  summary.scorecard.shortfallPersonDays === 0
                    ? "Every client can be staffed by the people assigned to them."
                    : "Work nobody could possibly do. Needs hiring, not rescheduling."
                }
              />
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          <GuidedTour month={month} />

          {/* -------------------------------------------------------------- */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card title="Problems found">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-3xl font-semibold tabular-nums text-[var(--crit)]">
                    {summary.hardCount}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    serious &mdash; block publishing
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-3xl font-semibold tabular-nums text-[var(--warn)]">
                    {summary.softCount}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    minor &mdash; worth knowing, not blocking
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--muted)]">
                  Every problem says what caused it and, where one exists, names a colleague who
                  could step in.
                </p>
                <Link
                  href={`/conflicts?month=${month}`}
                  className="text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  Read them &rarr;
                </Link>
              </div>
            </Card>

            <Card title="Status">
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {summary.status === "PUBLISHED" ? (
                    <Chip tone="ok">published</Chip>
                  ) : (
                    <Chip tone="accent">draft</Chip>
                  )}
                  {summary.canPublish ? (
                    <Chip tone="ok">ready to publish</Chip>
                  ) : (
                    <Chip tone="crit">blocked by problems</Chip>
                  )}
                </div>
                <p className="text-[var(--muted)]">
                  Built {summary.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </p>
                {summary.publishedAt && (
                  <p className="text-[var(--muted)]">
                    Published{" "}
                    {summary.publishedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </p>
                )}
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Rebuilding keeps any day a manager has edited by hand. Those squares are
                  outlined in blue on the schedule.
                </p>
              </div>
            </Card>
          </section>
        </>
      )}
    </>
  );
}

/** A scorecard tile that states the question it answers, not just a number. */
function ScoreTile({
  label,
  question,
  value,
  tone,
  verdict,
}: {
  label: string;
  question: string;
  value: string;
  tone: "ok" | "warn" | "crit";
  verdict: string;
}) {
  const ink = {
    ok: "text-[var(--ok)]",
    warn: "text-[var(--warn)]",
    crit: "text-[var(--crit)]",
  };
  const bar = {
    ok: "bg-[var(--ok)]",
    warn: "bg-[var(--warn)]",
    crit: "bg-[var(--crit)]",
  };

  return (
    <div className="relative flex flex-col overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${bar[tone]}`} />

      <div className="text-[14px] font-semibold leading-snug text-[var(--ink)]">{label}</div>
      <div className="mt-1 text-[12.5px] leading-snug text-[var(--faint)]">{question}</div>

      <div className={`tnum mt-4 text-[2.25rem] font-semibold leading-none ${ink[tone]}`}>
        {value}
      </div>

      <div className="mt-auto pt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
        {verdict}
      </div>
    </div>
  );
}
