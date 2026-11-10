import Link from "next/link";

import { db } from "@/lib/db";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { formatMonth } from "@/lib/scheduler/calendar";
import { Card, PageHeader } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

export default async function PodsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = DEFAULT_MONTH } = await searchParams;

  const pods = await db.pod.findMany({
    include: {
      lead: true,
      employees: { where: { active: true } },
      brands: { where: { active: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader eyebrow="Teams" title={`The ${pods.length} teams`} />

      <PageNote>
        Staff are grouped into teams (the brief calls them &ldquo;pods&rdquo;), each with a lead.
        Teams matter for two reasons: they are how managers view the schedule, and they are the
        first place the app looks when it needs to find somebody to cover a gap.
      </PageNote>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pods.map((pod) => (
          <Card key={pod.id} title={`${pod.name} team`}>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-[var(--muted)]">
                <span className="tnum font-semibold text-[var(--ink)]">{pod.employees.length}</span>{" "}
                people &middot;{" "}
                <span className="tnum font-semibold text-[var(--ink)]">{pod.brands.length}</span>{" "}
                clients
              </p>
              {pod.lead && (
                <p>
                  Lead:{" "}
                  <Link
                    href={`/roster/employee/${pod.lead.id}?month=${month}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {pod.lead.name}
                  </Link>
                </p>
              )}
              <Link
                href={`/roster/pod/${pod.id}?month=${month}`}
                className="text-[var(--accent)] hover:underline"
              >
                See the roster for {formatMonth(month)} &rarr;
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
