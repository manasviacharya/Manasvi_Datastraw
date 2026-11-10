import Link from "next/link";

import { db } from "@/lib/db";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { Card, PageHeader, SubmitButton } from "@/components/ui";
import { PageNote } from "@/components/explainer";
import { resetPlantedCasesAction } from "./actions";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/admin/catalog",
    title: "Clients, services and teams",
    blurb:
      "Create a new client, a new kind of work, or a new team. Nothing here is fixed in code.",
  },
  {
    href: "/admin/lines",
    title: "What clients buy, and when it runs",
    blurb:
      "Which kinds of work each client buys, which days each one runs, and how many people it needs. This is where a new operating pattern gets added without touching code.",
  },
  {
    href: "/admin/assignments",
    title: "Who covers which client",
    blurb: "Owners and backups for every client service.",
  },
  {
    href: "/admin/people",
    title: "People",
    blurb: "Names, preferred day off, and how many days in a row someone may work.",
  },
  {
    href: "/admin/holidays",
    title: "Public holidays",
    blurb: "An editable calendar. Each line of work decides separately whether it closes on them.",
  },
  {
    href: "/admin/leave",
    title: "Leave",
    blurb: "Approved leave for a month. New requests go through the impact check first.",
  },
  {
    href: "/leave",
    title: "Request leave, and see what it breaks",
    blurb: "See what a day of leave would break before approving it.",
  },
];

export default async function AdminPage() {
  const [brands, lines, assignments, people, holidays] = await Promise.all([
    db.brand.count(),
    db.brandProcess.count(),
    db.assignment.count(),
    db.employee.count(),
    db.holiday.count(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Manage the data"
        description={`${people} people, ${brands} brands, ${lines} lines of work, ${assignments} assignments, ${holidays} holidays. Everything the scheduler uses is editable here — no part of it is hardcoded.`}
        actions={
          <form action={resetPlantedCasesAction}>
            <SubmitButton variant="secondary" title="Reset test assignments and restore the 5 planted demo cases">
              Reset demo cases
            </SubmitButton>
          </form>
        }
      />

      <PageNote>
        <strong>Nothing the scheduler uses is fixed in code.</strong> Clients, services, teams,
        calendars, who covers what, holidays and leave can all be created and changed here
        without a developer. The calendar editor is where that is most visible: a
        client&rsquo;s operating pattern is seven checkboxes, so a pattern nobody anticipated is
        data rather than a code change.
      </PageNote>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href === "/leave" ? `${s.href}?month=${DEFAULT_MONTH}` : s.href}
            className="group flex flex-col rounded-[var(--radius)] bg-[var(--surface)] p-5 no-underline shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:no-underline"
          >
            <span className="text-[15px] font-semibold text-[var(--ink)] group-hover:text-[var(--accent)]">
              {s.title}
            </span>
            <span className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
              {s.blurb}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
