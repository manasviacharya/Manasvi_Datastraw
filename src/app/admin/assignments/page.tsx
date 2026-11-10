import { createAssignmentAction, deleteAssignmentAction } from "../actions";
import { db } from "@/lib/db";
import { Card, Chip, PageHeader, Scroller, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AssignmentsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const sp = await searchParams;

  const [lines, employees] = await Promise.all([
    db.brandProcess.findMany({
      include: {
        brand: true,
        process: true,
        assignments: {
          include: { employee: { include: { pod: true } } },
          orderBy: { isPrimary: "desc" },
        },
      },
      orderBy: [{ brand: { name: "asc" } }, { process: { code: "asc" } }],
    }),
    db.employee.findMany({
      where: { active: true },
      include: { pod: true },
      orderBy: [{ pod: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Who covers which client"
        description="An owner runs that client&rsquo;s work day to day. A backup can step in when they are away. Both count as real cover when the scheduler checks a day; the difference is whose job it is."
      />

      {(sp.saved || sp.deleted) && (
        <div className="mb-6 rounded-md border border-[var(--ok)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
          Saved. Regenerate the roster to apply it.
        </div>
      )}

      <div className="mb-6">
        <Card title="Assign someone">
          <form action={createAssignmentAction} className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Person
              </span>
              <select name="employeeId" className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5">
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.pod.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Line of work
              </span>
              <select name="brandProcessId" className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5">
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.brand.name} — {l.process.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPrimary" />
              <span>Owner (not just backup)</span>
            </label>
            <SubmitButton>Assign</SubmitButton>
          </form>
        </Card>
      </div>

      <Card>
        <Scroller>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line-strong)] text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--faint)]">
                <th className="py-3 pr-5">Client and service</th>
                <th className="py-3 pr-5">Owners</th>
                <th className="py-3 pr-5">Backups</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const owners = l.assignments.filter((a) => a.isPrimary);
                const backups = l.assignments.filter((a) => !a.isPrimary);
                return (
                  <tr key={l.id} className="border-b border-[var(--line)] align-top transition-colors hover:bg-[var(--surface-2)]">
                    <td className="py-3 pr-5">
                      <div className="font-medium">{l.brand.name}</div>
                      <div className="text-[var(--muted)]">{l.process.code}</div>
                    </td>
                    <td className="py-3 pr-5">
                      {owners.length === 0 ? (
                        <Chip tone="crit">nobody owns this</Chip>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {owners.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              <span>{a.employee.name}</span>
                              <form action={deleteAssignmentAction}>
                                <input type="hidden" name="id" value={a.id} />
                                <button type="submit" className="text-xs text-[var(--muted)] hover:text-[var(--crit)]">
                                  remove
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-3 pr-5">
                      {backups.length === 0 ? (
                        <span className="text-[var(--muted)]">none</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {backups.map((a) => (
                            <li key={a.id} className="flex items-center gap-2 text-[var(--muted)]">
                              <span>{a.employee.name}</span>
                              <form action={deleteAssignmentAction}>
                                <input type="hidden" name="id" value={a.id} />
                                <button type="submit" className="text-xs hover:text-[var(--crit)]">
                                  remove
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
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
