import Link from "next/link";

import { deleteLeaveAction } from "@/app/actions";
import { db } from "@/lib/db";
import { DEFAULT_MONTH, selectableMonths } from "@/lib/roster-service";
import { formatMonth, formatShort } from "@/lib/scheduler/calendar";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeaveAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = DEFAULT_MONTH } = await searchParams;

  const leaves = await db.leave.findMany({
    where: { date: { startsWith: month } },
    include: { employee: { include: { pod: true } } },
    orderBy: [{ date: "asc" }],
  });

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title={`Leave in ${formatMonth(month)}`}
        description={
          <>
            {leaves.length} approved {leaves.length === 1 ? "day" : "days"}. To add one, use the{" "}
            <Link href={`/leave?month=${month}`} className="text-[var(--accent)] hover:underline">
              leave request page
            </Link>{" "}
            — it shows the effect before you commit to it.
          </>
        }
        actions={
          <form method="get" className="flex items-center gap-2">
            <select
              name="month"
              defaultValue={month}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            >
              {selectableMonths().map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
            >
              Show
            </button>
          </form>
        }
      />

      {leaves.length === 0 ? (
        <EmptyState title={`No leave recorded in ${formatMonth(month)}`} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
            {leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-mono text-xs tabular-nums text-[var(--muted)]">
                  {formatShort(l.date)}
                </span>
                <Link
                  href={`/roster/employee/${l.employeeId}?month=${month}`}
                  className="font-medium hover:underline"
                >
                  {l.employee.name}
                </Link>
                <span className="text-[var(--muted)]">{l.employee.pod.name}</span>
                <Chip tone={l.type === "SICK" ? "crit" : "warn"}>{l.type.replace("_", "-")}</Chip>
                {l.reason && (
                  <span className="min-w-[200px] flex-1 text-xs text-[var(--muted)]">
                    {l.reason}
                  </span>
                )}
                <form action={deleteLeaveAction}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="month" value={month} />
                  <button
                    type="submit"
                    className="text-xs text-[var(--muted)] hover:text-[var(--crit)] hover:underline"
                  >
                    withdraw
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
