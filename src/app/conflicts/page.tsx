import Link from "next/link";

import { Suspense } from "react";

import { applySuggestionAction } from "@/app/actions";

import { ExplainPanel, ExplainPrompt, ExplainSkeleton } from "./explain-panel";
import { db } from "@/lib/db";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { formatMonth, formatShort } from "@/lib/scheduler/calendar";
import { Banner, Card, Chip, EmptyState, PageHeader, SeverityChip, SubmitButton } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

/** Plain-English names for each kind of problem. */
const KIND_LABEL: Record<string, string> = {
  STAFFING_SHORTFALL: "Cannot be staffed",
  EMPLOYEE_OVERCOMMITTED: "One person, too many clients",
  COVERAGE_GAP: "Nobody on duty",
  DOUBLE_BOOKED: "Double booked",
  NO_WEEKLY_OFF: "No weekly off",
  PREFERENCE_OVERRIDDEN: "Preferred day off overridden",
  CONSECUTIVE_DAYS: "Too many days in a row",
};

const KIND_EXPLAINER: Record<string, string> = {
  STAFFING_SHORTFALL:
    "The work demanded is more than the assigned people can physically do. This is arithmetic, not scheduling — no roster can fix it.",
  EMPLOYEE_OVERCOMMITTED:
    "Every client this person covers looks fine on its own, but together they need more days than one person can work. Arithmetic, not scheduling.",
  COVERAGE_GAP: "A client expects cover on this day and nobody assigned is available.",
  NO_WEEKLY_OFF: "Everyone is entitled to one day off a week. This cannot be traded for coverage.",
  PREFERENCE_OVERRIDDEN:
    "Someone did not get their preferred day off. A preference, so it yields when a client needs cover.",
  CONSECUTIVE_DAYS: "Someone works a long unbroken run. A soft limit, worth watching.",
};

export default async function ConflictsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string; severity?: string; kind?: string; blocked?: string; explain?: string;
    applied?: string;
  }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? DEFAULT_MONTH;

  const roster = await db.roster.findUnique({
    where: { month },
    include: {
      violations: {
        include: {
          employee: true,
          brandProcess: { include: { brand: true, process: true } },
        },
        orderBy: [{ severity: "asc" }, { kind: "asc" }, { date: "asc" }],
      },
    },
  });

  if (!roster) {
    return (
      <>
        <PageHeader eyebrow="Problems" title={`Problems for ${formatMonth(month)}`} />
        <EmptyState title="No roster generated for this month yet">
          <p>
            Generate one from the{" "}
            <Link href="/" className="text-[var(--accent)] hover:underline">
              dashboard
            </Link>
            .
          </p>
        </EmptyState>
      </>
    );
  }

  // Names for the people suggestions point at, so the button can say who it
  // will assign rather than "apply".
  const suggestedIds = [
    ...new Set(roster.violations.map((v) => v.suggestedEmployeeId).filter(Boolean) as string[]),
  ];
  const suggestedNames = new Map(
    (suggestedIds.length
      ? await db.employee.findMany({
          where: { id: { in: suggestedIds } },
          select: { id: true, name: true },
        })
      : []
    ).map((e) => [e.id, e.name])
  );

  const all = roster.violations;
  const filtered = all.filter(
    (v) =>
      (!sp.severity || v.severity === sp.severity) && (!sp.kind || v.kind === sp.kind)
  );

  const hard = all.filter((v) => v.severity === "HARD");
  const soft = all.filter((v) => v.severity === "SOFT");

  const kindCounts = new Map<string, number>();
  for (const v of all) kindCounts.set(v.kind, (kindCounts.get(v.kind) ?? 0) + 1);

  // Whether the viewer has asked for a written summary. The panel itself is
  // rendered inside a Suspense boundary below, so asking for one does not
  // hold up the rest of the page.
  const wantsExplanation = sp.explain === "1";

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ month });
    const sev = over.severity ?? sp.severity;
    const kind = over.kind ?? sp.kind;
    if (sev) p.set("severity", sev);
    if (kind) p.set("kind", kind);
    return `/conflicts?${p}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Problems"
        title={`What needs attention — ${formatMonth(month)}`}
      />

      <PageNote>
        <strong>This is the screen that matters most.</strong> Rather than quietly producing a
        schedule with holes in it, the app lists every problem it found and explains the cause.
        {hard.length === 0 ? (
          <> Nothing serious is outstanding, so this month is ready to publish.</>
        ) : (
          <>
            {" "}
            <strong>{hard.length} serious problems</strong> block publishing and{" "}
            {soft.length} minor ones are listed for information. Look for{" "}
            <strong>&ldquo;Cannot be staffed&rdquo;</strong> first &mdash; that one means no
            schedule could ever work, so it needs a hiring or contract decision rather than a
            reshuffle.
          </>
        )}
      </PageNote>

      {sp.applied && (
        <div className="mb-6">
          <Banner tone="ok" title="Applied.">
            {sp.applied} The schedule has been rebuilt.
          </Banner>
        </div>
      )}

      {sp.blocked && (
        <div className="mb-6 rounded-md border border-[var(--crit)] bg-[var(--crit-soft)] px-4 py-3 text-sm text-[var(--crit)]">
          <strong>Not published.</strong> {sp.blocked}
        </div>
      )}

      <div className="mb-5">
        {wantsExplanation ? (
          <Suspense fallback={<ExplainSkeleton />}>
            <ExplainPanel month={month} findingCount={all.length} />
          </Suspense>
        ) : (
          <ExplainPrompt month={month} />
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`/conflicts?month=${month}`}
          className={`rounded-full px-3 py-1 text-[13px] font-medium no-underline ring-1 ring-inset transition-colors hover:no-underline ${
            !sp.severity && !sp.kind
              ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
              : "bg-[var(--surface)] text-[var(--ink-2)] ring-[var(--line-strong)] hover:bg-[var(--surface-2)]"
          }`}
        >
          All {all.length}
        </Link>
        <Link
          href={qs({ severity: "HARD", kind: "" })}
          className={`rounded-full px-3 py-1 text-[13px] font-medium no-underline ring-1 ring-inset transition-colors hover:no-underline ${
            sp.severity === "HARD"
              ? "bg-[var(--crit)] text-white ring-[var(--crit)]"
              : "bg-[var(--surface)] text-[var(--ink-2)] ring-[var(--line-strong)] hover:bg-[var(--surface-2)]"
          }`}
        >
          Must fix {hard.length}
        </Link>
        <Link
          href={qs({ severity: "SOFT", kind: "" })}
          className={`rounded-full px-3 py-1 text-[13px] font-medium no-underline ring-1 ring-inset transition-colors hover:no-underline ${
            sp.severity === "SOFT"
              ? "bg-[var(--warn)] text-white ring-[var(--warn)]"
              : "bg-[var(--surface)] text-[var(--ink-2)] ring-[var(--line-strong)] hover:bg-[var(--surface-2)]"
          }`}
        >
          Warnings {soft.length}
        </Link>

        <span className="mx-1 h-4 w-px bg-[var(--line)]" />

        {[...kindCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([kind, n]) => (
            <Link
              key={kind}
              href={qs({ kind, severity: "" })}
              className={`rounded-full px-3 py-1 text-[13px] no-underline ring-1 ring-inset transition-colors hover:no-underline ${
                sp.kind === kind
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)] ring-[var(--accent-line)]"
                  : "bg-[var(--surface)] text-[var(--muted)] ring-[var(--line-strong)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {KIND_LABEL[kind] ?? kind} {n}
            </Link>
          ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing matches that filter">
          <p>
            <Link href={`/conflicts?month=${month}`} className="text-[var(--accent)] hover:underline">
              Clear the filter
            </Link>
          </p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((v) => (
            <li key={v.id}>
              <Card>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={v.severity} />
                    <Chip>{KIND_LABEL[v.kind] ?? v.kind}</Chip>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {v.date ? formatShort(v.date) : "whole month"}
                    </span>
                    {v.brandProcess && (
                      <Link
                        href={`/roster/brand/${v.brandProcess.brandId}?month=${month}`}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        {v.brandProcess.brand.name} / {v.brandProcess.process.code}
                      </Link>
                    )}
                    {v.employee && (
                      <Link
                        href={`/roster/employee/${v.employee.id}?month=${month}`}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        {v.employee.name}
                      </Link>
                    )}
                  </div>

                  <p className="text-[14.5px] leading-relaxed text-[var(--ink)]">{v.message}</p>

                  {v.suggestion && (
                    <div className="relative overflow-hidden rounded-[var(--radius-sm)] bg-[var(--accent-soft)] py-2.5 pl-4 pr-3">
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" />
                      <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                        <strong className="mr-1 text-[var(--accent)]">Suggestion</strong>
                        {v.suggestion}
                      </p>

                      {/* Only offered where the fix is a single action with a
                          named person. A staffing shortfall needs a hire or a
                          renegotiated contract, so there is nothing to click. */}
                      {v.suggestedEmployeeId && v.brandProcessId && (
                        <form action={applySuggestionAction} className="mt-2.5 flex flex-wrap items-center gap-2.5">
                          <input type="hidden" name="violationId" value={v.id} />
                          <input type="hidden" name="month" value={month} />
                          <SubmitButton>
                            Assign{" "}
                            {suggestedNames.get(v.suggestedEmployeeId) ?? "them"} and rebuild
                          </SubmitButton>
                          <span className="text-xs text-[var(--muted)]">
                            Adds them as backup cover and regenerates the month. Takes a few
                            seconds.
                          </span>
                        </form>
                      )}
                    </div>
                  )}

                  {KIND_EXPLAINER[v.kind] && (
                    <p className="text-xs leading-relaxed text-[var(--muted)]">
                      {KIND_EXPLAINER[v.kind]}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
