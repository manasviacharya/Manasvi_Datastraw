import Link from "next/link";

import {
  createBrandAction,
  createPodAction,
  createProcessAction,
  deleteBrandAction,
  deletePodAction,
  deleteProcessAction,
} from "../actions";
import { db } from "@/lib/db";
import { PageNote } from "@/components/explainer";
import { Banner, Card, Chip, PageHeader, QuietDanger, Scroller, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Create new clients, services and teams.
 *
 * The brief's mandatory requirement is that ASSIGNMENTS can be changed
 * without touching code, which /admin/assignments covers. Creating whole new
 * clients and services is the separate optional item -- "support for adding
 * new brands, pods, and processes dynamically" -- and this page is it.
 *
 * Worth knowing what a new row does and does not do: a client created here
 * has no services and nobody assigned yet, so it is invisible to the
 * scheduler until both are added. That is stated on the page rather than left
 * to be discovered, because an empty client silently doing nothing would look
 * like a bug.
 */
export default async function CatalogAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string }>;
}) {
  const { created, deleted } = await searchParams;

  const [brands, processes, pods] = await Promise.all([
    db.brand.findMany({
      include: { ownerPod: true, _count: { select: { brandProcesses: true } } },
      orderBy: { name: "asc" },
    }),
    db.process.findMany({
      include: { _count: { select: { brandProcesses: true } } },
      orderBy: { code: "asc" },
    }),
    db.pod.findMany({
      include: { lead: true, _count: { select: { employees: true, brands: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const LABEL: Record<string, string> = {
    client: "Client created. Give it at least one service below, then assign somebody to it.",
    service: "Service created. Any client can now buy it, on its own calendar.",
    team: "Team created. Move people into it from the staff settings.",
    client_deleted: "Client removed.",
    service_deleted: "Service removed.",
    team_deleted: "Team removed.",
  };

  return (
    <>
      <PageHeader eyebrow="Settings" title="Clients, services and teams" />

      <PageNote>
        <strong>This is where new things get created.</strong> A client added here starts with no
        services and nobody assigned, so the scheduler ignores it until both exist &mdash; which
        is deliberate, not a bug. Use{" "}
        <Link href="/admin/lines">what each client buys</Link> to give it a calendar, then{" "}
        <Link href="/admin/assignments">who covers which client</Link> to staff it.
      </PageNote>

      {(created || deleted) && (
        <div className="mb-6">
          <Banner tone="ok" title="Saved.">
            {LABEL[created ?? ""] ?? LABEL[`${deleted}_deleted`] ?? "Done."}
          </Banner>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* ---------------- Clients ---------------- */}
        <Card
          title={`Clients (${brands.length})`}
          footer="A short code is used in compact views where the full name will not fit."
        >
          <form action={createBrandAction} className="mb-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label">Client name</span>
              <input type="text" name="name" required placeholder="Alder &amp; Finch" className="w-56" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Short code</span>
              <input type="text" name="code" required placeholder="ALD" maxLength={8} className="w-24 uppercase" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Owning team</span>
              <select name="ownerPodId" defaultValue="">
                <option value="">None yet</option>
                {pods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <SubmitButton>Add client</SubmitButton>
          </form>

          <Scroller>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line-strong)] text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--faint)]">
                  <th className="py-2 pr-5">Client</th>
                  <th className="py-2 pr-5">Code</th>
                  <th className="py-2 pr-5">Team</th>
                  <th className="py-2 pr-5">Services</th>
                  <th className="py-2 pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--line)] transition-colors hover:bg-[var(--surface-2)]">
                    <td className="py-2.5 pr-5 font-medium">{b.name}</td>
                    <td className="py-2.5 pr-5 text-[var(--muted)]">{b.code}</td>
                    <td className="py-2.5 pr-5 text-[var(--muted)]">{b.ownerPod?.name ?? "—"}</td>
                    <td className="py-2.5 pr-5">
                      {b._count.brandProcesses === 0 ? (
                        <Chip tone="warn">none yet</Chip>
                      ) : (
                        <span className="tnum">{b._count.brandProcesses}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 text-right">
                      {b._count.brandProcesses === 0 && (
                        <form action={deleteBrandAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <QuietDanger>remove</QuietDanger>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        </Card>

        {/* ---------------- Services ---------------- */}
        <Card
          title={`Services (${processes.length})`}
          footer="Each client picks its own calendar for a service, so the same service can run seven days at one client and weekdays only at another."
        >
          <form action={createProcessAction} className="mb-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label">Service name</span>
              <input type="text" name="name" required placeholder="Social Media Replies" className="w-56" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Short code</span>
              <input type="text" name="code" required placeholder="SMR" maxLength={8} className="w-24 uppercase" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Description</span>
              <input type="text" name="description" placeholder="What the work involves" className="w-64" />
            </label>
            <SubmitButton>Add service</SubmitButton>
          </form>

          <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
            {processes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="font-medium">{p.name}</span>
                <Chip>{p.code}</Chip>
                <span className="text-[var(--muted)]">{p.description}</span>
                <span className="ml-auto flex items-center gap-3 text-[var(--faint)]">
                  {p._count.brandProcesses === 0 ? (
                    <Chip tone="warn">not bought yet</Chip>
                  ) : (
                    <>bought by {p._count.brandProcesses} clients</>
                  )}
                  {p._count.brandProcesses === 0 && (
                    <form action={deleteProcessAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <QuietDanger>remove</QuietDanger>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ---------------- Teams ---------------- */}
        <Card
          title={`Teams (${pods.length})`}
          footer="To set a team's lead, or move somebody between teams, use the staff settings."
        >
          <form action={createPodAction} className="mb-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label">Team name</span>
              <input type="text" name="name" required placeholder="Garnet" className="w-56" />
            </label>
            <SubmitButton>Add team</SubmitButton>
          </form>

          <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
            {pods.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="font-medium">{p.name}</span>
                <span className="text-[var(--muted)]">
                  {p._count.employees} people · {p._count.brands} clients
                </span>
                <span className="ml-auto flex items-center gap-3 text-[var(--faint)]">
                  {p.lead ? `led by ${p.lead.name}` : <Chip tone="warn">no lead</Chip>}
                  {p._count.employees === 0 && p._count.brands === 0 && (
                    <form action={deletePodAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <QuietDanger>remove</QuietDanger>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
