import Link from "next/link";

import { db } from "@/lib/db";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { describeCalendar, describeMinStaff } from "@/lib/scheduler/calendar";
import { Card, Chip, PageHeader, Scroller } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = DEFAULT_MONTH } = await searchParams;

  const brands = await db.brand.findMany({
    where: { active: true },
    include: {
      ownerPod: true,
      brandProcesses: {
        where: { active: true },
        include: { process: true, assignments: true },
        orderBy: { process: { code: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  const withOwnerCount = brands.map((b) => {
    const owners = new Set(
      b.brandProcesses.flatMap((bp) =>
        bp.assignments.filter((a) => a.isPrimary).map((a) => a.employeeId)
      )
    );
    return { brand: b, ownerCount: owners.size };
  });

  // Brands that buy no services yet are excluded from the ratio. They are
  // neither single-resource nor multi-resource -- there is nothing to staff --
  // and counting them would let a half-created client quietly move the figure
  // the brief actually cares about.
  const staffed = withOwnerCount.filter((x) => x.brand.brandProcesses.length > 0);
  const single = staffed.filter((x) => x.ownerCount === 1).length;
  const pct = staffed.length > 0 ? Math.round((single / staffed.length) * 100) : 0;
  const unstaffed = withOwnerCount.length - staffed.length;

  return (
    <>
      <PageHeader eyebrow="Clients" title="The client brands" />

      <PageNote>
        Each client buys one or more <strong>types of work</strong> &mdash; support tickets,
        abandoned-cart calls, failed-delivery follow-up, retention &mdash; and{" "}
        <strong>each type runs on its own calendar</strong>. Look at{" "}
        <strong>Castellan Leather</strong>: its support runs every day while its cart recovery runs
        weekdays only. One client, two schedules.
        <br />
        <br />
        The <strong>Staffing</strong> column is where the difficulty lives:{" "}
        <strong>
          {single} of the {staffed.length} brands that buy anything ({pct}%) are covered by
          just one person
        </strong>
        , so that person&rsquo;s day off leaves their client with nobody.
        {unstaffed > 0 && (
          <>
            {" "}
            <span className="text-[var(--muted)]">
              ({unstaffed} further {unstaffed === 1 ? "brand buys" : "brands buy"} no services
              yet and {unstaffed === 1 ? "is" : "are"} left out of that ratio.)
            </span>
          </>
        )}
      </PageNote>

      <Card>
        <Scroller>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line-strong)] text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--faint)]">
                <th className="py-3 pr-5">Brand</th>
                <th className="py-3 pr-5">Team</th>
                <th className="py-3 pr-5">Staffing</th>
                <th className="py-3 pr-5">What they buy, and when it runs</th>
              </tr>
            </thead>
            <tbody>
              {withOwnerCount.map(({ brand, ownerCount }) => (
                <tr key={brand.id} className="border-b border-[var(--line)] align-top transition-colors hover:bg-[var(--surface-2)]">
                  <td className="py-3 pr-5">
                    <Link
                      href={`/roster/brand/${brand.id}?month=${month}`}
                      className="font-medium hover:underline"
                    >
                      {brand.name}
                    </Link>
                    <div className="font-mono text-[10px] text-[var(--muted)]">{brand.code}</div>
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">
                    {brand.ownerPod?.name ?? "—"}
                  </td>
                  <td className="py-3 pr-5">
                    {brand.brandProcesses.length === 0 ? (
                      <Chip>buys nothing yet</Chip>
                    ) : ownerCount === 1 ? (
                      <Chip tone="warn">one owner</Chip>
                    ) : (
                      <Chip tone="ok">{ownerCount} owners</Chip>
                    )}
                  </td>
                  <td className="py-3 pr-5">
                    <ul className="flex flex-col gap-1">
                      {brand.brandProcesses.map((bp) => (
                        <li key={bp.id} className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[70px] font-medium">{bp.process.code}</span>
                          <span className="text-[var(--muted)]">{describeCalendar(bp)}</span>
                          {new Set(
                            bp.weekdayMask
                              .map((open, i) => (open ? bp.minStaffByWeekday[i] : null))
                              .filter((v) => v !== null)
                          ).size > 1 ? (
                            <Chip tone="accent">{describeMinStaff(bp)}</Chip>
                          ) : (
                            bp.minStaffByWeekday.some((n, i) => bp.weekdayMask[i] && n > 1) && (
                              <Chip>{describeMinStaff(bp)}</Chip>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </Card>
    </>
  );
}
