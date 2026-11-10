import Link from "next/link";

import { db } from "@/lib/db";
import { DEFAULT_MONTH, getRoster } from "@/lib/roster-service";
import { formatMonth } from "@/lib/scheduler/calendar";
import { buildRows, RosterGrid } from "@/components/roster-grid";
import { Card, DayLegend, EmptyState, PageHeader } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

export default async function CompanyRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = DEFAULT_MONTH } = await searchParams;

  const [roster, employees, holidays] = await Promise.all([
    getRoster(month),
    db.employee.findMany({
      where: { active: true },
      include: { pod: true },
      orderBy: [{ pod: { name: "asc" } }, { isPodLead: "desc" }, { name: "asc" }],
    }),
    db.holiday.findMany({ where: { date: { startsWith: month } } }),
  ]);

  if (!roster) {
    return (
      <>
        <PageHeader eyebrow="Company" title={`Roster for ${formatMonth(month)}`} />
        <EmptyState title="Nothing generated for this month yet">
          <p>
            Go to the <Link href="/" className="text-[var(--accent)] hover:underline">dashboard</Link>{" "}
            and generate a roster first.
          </p>
        </EmptyState>
      </>
    );
  }

  const rows = buildRows(employees, roster.days);
  const holidayMap = Object.fromEntries(holidays.map((h) => [h.date, h.name]));

  const working = roster.days.filter((d) => d.state === "WORKING").length;
  const locked = roster.days.filter((d) => d.isLocked).length;

  return (
    <>
      <PageHeader
        eyebrow="The schedule"
        title={`Who works when — ${formatMonth(month)}`}
      />

      <PageNote>
        <strong>Staff down the side, days across the top.</strong> Each square is one person on
        one day. <strong>Hover any square</strong> and it tells you exactly why that person is
        working or off &mdash; including which client forced the decision.{" "}
        {working.toLocaleString()} working days across {employees.length} people.
        {locked > 0 && (
          <>
            {" "}
            {locked} {locked === 1 ? "square has" : "squares have"} been edited by hand and
            {locked === 1 ? " is" : " are"} outlined in blue; rebuilding the schedule leaves
            {locked === 1 ? " it" : " them"} alone.
          </>
        )}
      </PageNote>

      <div className="mb-4">
        <DayLegend />
      </div>

      <Card
        pad={false}
        footer={
          <>
            A box outlined in blue was set by hand and will survive regeneration. Click a name to
            see that person&rsquo;s month in full.
          </>
        }
      >
        <RosterGrid month={month} rows={rows} holidays={holidayMap} />
      </Card>
    </>
  );
}
