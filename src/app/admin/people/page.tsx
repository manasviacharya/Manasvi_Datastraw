import { saveEmployeeAction } from "../actions";
import { db } from "@/lib/db";
import { Card, Chip, PageHeader, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function PeopleAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const employees = await db.employee.findMany({
    include: { pod: true, _count: { select: { assignments: true } } },
    orderBy: [{ pod: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="People"
        description="The preferred day off is a wish, not a rule — the scheduler overrides it when a client needs cover, and always records that it did. Maximum days in a row is a soft limit that produces a warning rather than a failure."
      />

      {sp.saved && (
        <div className="mb-6 rounded-md border border-[var(--ok)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
          Saved. Regenerate the roster to apply it.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {employees.map((e) => (
          <Card key={e.id}>
            <form action={saveEmployeeAction} className="flex flex-wrap items-end gap-x-4 gap-y-3 text-sm">
              <input type="hidden" name="id" value={e.id} />

              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Name
                </span>
                <input
                  type="text"
                  name="name"
                  defaultValue={e.name}
                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Pod
                </span>
                <span className="py-1.5 text-[var(--muted)]">
                  {e.pod.name}
                  {e.isPodLead && <Chip tone="accent">lead</Chip>}
                </span>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Prefers off
                </span>
                <select
                  name="preferredWeeklyOff"
                  defaultValue={e.preferredWeeklyOff}
                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
                >
                  {DAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Max days in a row
                </span>
                <input
                  type="number"
                  name="maxConsecutiveDays"
                  defaultValue={e.maxConsecutiveDays}
                  min={1}
                  max={14}
                  className="w-24 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
                />
              </label>

              <label className="flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked={e.active} />
                <span>Active</span>
              </label>

              <span className="text-xs text-[var(--muted)]">
                {e._count.assignments} assignments
              </span>

              <SubmitButton>Save</SubmitButton>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
