import Link from "next/link";

import { db } from "@/lib/db";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { Card, Chip, PageHeader, Scroller } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = DEFAULT_MONTH } = await searchParams;

  const employees = await db.employee.findMany({
    where: { active: true },
    include: {
      pod: true,
      assignments: { include: { brandProcess: { include: { brand: true } } } },
      leaves: { where: { date: { startsWith: month }, status: "APPROVED" } },
    },
    orderBy: [{ pod: { name: "asc" } }, { isPodLead: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader eyebrow="Staff" title={`All ${employees.length} staff`} />

      <PageNote>
        <strong>Owns</strong> means they run that client&rsquo;s work day to day.{" "}
        <strong>Backs up</strong> means they can step in when somebody is away &mdash; which is
        how team leads are used here, so their &ldquo;owns&rdquo; count is zero.{" "}
        <strong>Prefers off</strong> is a request, not a right: the scheduler honours it when it
        can and records a reason whenever it cannot. Click any name to see their month.
      </PageNote>

      <Card>
        <Scroller>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line-strong)] text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--faint)]">
                <th className="py-3 pr-5">Name</th>
                <th className="py-3 pr-5">Pod</th>
                <th className="py-3 pr-5">Prefers off</th>
                <th className="py-3 pr-5 text-right">Owns</th>
                <th className="py-3 pr-5 text-right">Backs up</th>
                <th className="py-3 pr-5 text-right">Leave</th>
                <th className="py-3 pr-5">Brands</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const owned = e.assignments.filter((a) => a.isPrimary);
                const backup = e.assignments.filter((a) => !a.isPrimary);
                const brands = [...new Set(owned.map((a) => a.brandProcess.brand.name))];
                return (
                  <tr key={e.id} className="border-b border-[var(--line)] transition-colors hover:bg-[var(--surface-2)]">
                    <td className="py-3 pr-5">
                      <Link
                        href={`/roster/employee/${e.id}?month=${month}`}
                        className="font-medium hover:underline"
                      >
                        {e.name}
                      </Link>
                      {e.isPodLead && <Chip tone="accent">lead</Chip>}
                    </td>
                    <td className="py-2 pr-4 text-[var(--muted)]">{e.pod.name}</td>
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {DAY_NAMES[e.preferredWeeklyOff]}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{owned.length}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-[var(--muted)]">
                      {backup.length}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {e.leaves.length > 0 ? (
                        <Chip tone="warn">{e.leaves.length}</Chip>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-[var(--muted)]">
                      {brands.length > 0 ? brands.join(", ") : "backup cover only"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>
      </Card>
    </>
  );
}
