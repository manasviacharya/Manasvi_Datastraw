import { createHolidayAction, deleteHolidayAction } from "../actions";
import { db } from "@/lib/db";
import { formatShort } from "@/lib/scheduler/calendar";
import { Card, PageHeader, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HolidaysAdminPage() {
  const holidays = await db.holiday.findMany({ orderBy: { date: "asc" } });

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Public holidays"
        description="An editable list, not a list buried in the code. Whether a line of work closes on these days is set per line of work, so one client can trade through a holiday while another closes."
      />

      <div className="mb-6">
        <Card title="Add a holiday">
          <form action={createHolidayAction} className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Date</span>
              <input type="date" name="date" required className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Name</span>
              <input type="text" name="name" required placeholder="Republic Day" className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5" />
            </label>
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      </div>

      <Card>
        <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>
                <span className="font-mono tabular-nums text-[var(--muted)]">{h.date}</span>
                <span className="ml-3">{h.name}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">{formatShort(h.date)}</span>
              </span>
              <form action={deleteHolidayAction}>
                <input type="hidden" name="id" value={h.id} />
                <button type="submit" className="text-xs text-[var(--muted)] hover:text-[var(--crit)] hover:underline">
                  remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
