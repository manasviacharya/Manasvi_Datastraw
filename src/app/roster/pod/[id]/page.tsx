import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { DEFAULT_MONTH, getRoster } from "@/lib/roster-service";
import { formatMonth } from "@/lib/scheduler/calendar";
import { buildRows, RosterGrid } from "@/components/roster-grid";
import { Card, DayLegend, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PodRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month = DEFAULT_MONTH } = await searchParams;

  const [pod, roster, holidays] = await Promise.all([
    db.pod.findUnique({
      where: { id },
      include: {
        lead: true,
        employees: {
          where: { active: true },
          include: { pod: true },
          orderBy: [{ isPodLead: "desc" }, { name: "asc" }],
        },
      },
    }),
    getRoster(month),
    db.holiday.findMany({ where: { date: { startsWith: month } } }),
  ]);

  if (!pod) notFound();

  const memberIds = new Set(pod.employees.map((e) => e.id));
  const days = (roster?.days ?? []).filter((d) => memberIds.has(d.employeeId));
  const rows = buildRows(pod.employees, days);

  return (
    <>
      <PageHeader
        eyebrow="Pod"
        title={pod.name}
        description={
          <>
            {pod.employees.length} people
            {pod.lead && (
              <>
                {" "}
                &middot; led by{" "}
                <Link
                  href={`/roster/employee/${pod.lead.id}?month=${month}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {pod.lead.name}
                </Link>
              </>
            )}{" "}
            &middot; {formatMonth(month)}
          </>
        }
        actions={
          <Link
            href={`/pods?month=${month}`}
            className="inline-flex items-center rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            All pods
          </Link>
        }
      />

      {!roster ? (
        <EmptyState title={`No roster generated for ${formatMonth(month)}`} />
      ) : (
        <>
          <div className="mb-4">
            <DayLegend />
          </div>
          <Card pad={false}>
            <RosterGrid
              month={month}
              rows={rows}
              holidays={Object.fromEntries(holidays.map((h) => [h.date, h.name]))}
            />
          </Card>
        </>
      )}
    </>
  );
}
