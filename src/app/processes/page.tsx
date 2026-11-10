import Link from "next/link";

import { db } from "@/lib/db";
import { DEFAULT_MONTH } from "@/lib/roster-service";
import { Card, Chip, PageHeader } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

export default async function ProcessesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = DEFAULT_MONTH } = await searchParams;

  const processes = await db.process.findMany({
    include: {
      brandProcesses: {
        where: { active: true },
        include: { brand: true, assignments: true },
      },
    },
    orderBy: { code: "asc" },
  });

  return (
    <>
      <PageHeader eyebrow="Types of work" title="What the company actually sells" />

      <PageNote>
        These are the four services clients buy. The same service can run on a completely
        different calendar at each client, which is why the schedule is stored per
        client-and-service pair rather than per client. Click one to see who covers it across
        every brand &mdash; that list is exactly where the app searches when it needs a stand-in.
      </PageNote>
      <div className="grid gap-4 sm:grid-cols-2">
        {processes.map((p) => {
          const people = new Set(
            p.brandProcesses.flatMap((bp) => bp.assignments.map((a) => a.employeeId))
          );
          return (
            <Card
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="text-[var(--ink)]">{p.name}</span>
                  <Chip>{p.code}</Chip>
                </span>
              }
            >
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-[var(--muted)]">{p.description}</p>
                <p className="text-[var(--muted)]">
                  {p.brandProcesses.length} brands &middot; {people.size} people trained
                </p>
                <Link
                  href={`/roster/process/${p.id}?month=${month}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  Staffing across all brands &rarr;
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
