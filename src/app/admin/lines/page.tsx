import { createLineAction, deleteLineAction, saveLineAction } from "../actions";
import { db } from "@/lib/db";
import { describeCalendar, describeMinStaff } from "@/lib/scheduler/calendar";
import { RuleForm } from "./rule-form";
import { Card, Chip, PageHeader, SubmitButton } from "@/components/ui";
import { PageNote } from "@/components/explainer";

export const dynamic = "force-dynamic";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The calendar editor.
 *
 * This page is the reason the brief's "no code changes" requirement holds. A
 * calendar here is seven checkboxes plus a holiday toggle, so the three
 * patterns named in the brief are just data -- and so is any fourth pattern a
 * client asks for next month.
 */
export default async function LinesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; created?: string; deleted?: string; rule?: string }>;
}) {
  const sp = await searchParams;

  const [lines, brands, processes] = await Promise.all([
    db.brandProcess.findMany({
      include: {
        brand: true,
        process: true,
        _count: { select: { assignments: true } },
      },
      orderBy: [{ brand: { name: "asc" } }, { process: { code: "asc" } }],
    }),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.process.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="What each client buys, and when it runs"
        description="Each row is one kind of work for one client, with its own operating calendar. Changing a calendar here needs no code change — which is why the calendar is seven checkboxes rather than a fixed list of patterns."
      />

      <PageNote>
        <strong>Each row is one service for one client, with its own calendar.</strong> The
        seven checkboxes are the operating days. This is why the brief&rsquo;s &ldquo;no code
        changes&rdquo; requirement actually holds: the three patterns it names, and any fourth a
        client invents next month, are all just data.
        <br />
        <br />
        <strong>People needed</strong> is set per weekday, not once, so a client can pay for
        three on Mondays to clear the weekend backlog and two the rest of the week. Boxes for
        days the client is closed are greyed out, since no minimum applies.
        <br />
        <br />
        The box below lets you <strong>type a rule as a sentence</strong> and have it fill the
        form in. It never saves by itself &mdash; you check what it understood first.
      </PageNote>

      {(sp.saved || sp.created || sp.deleted) && (
        <div className="mb-6 rounded-md border border-[var(--ok)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
          Saved. Regenerate the roster from the dashboard to apply it.
        </div>
      )}

      <div className="mb-6">
        <RuleForm brands={brands} processes={processes} text={sp.rule} />
      </div>

      <div className="mb-6">
        <Card title="Or fill the form in yourself">
          <form action={createLineAction} className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Brand
              </span>
              <select
                name="brandId"
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Kind of work
              </span>
              <select
                name="processId"
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
              >
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="flex flex-col gap-1">
              <legend className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Open on
              </legend>
              <div className="flex gap-1">
                {DAY_LETTERS.map((letter, i) => (
                  <label
                    key={i}
                    title={DAY_FULL[i]}
                    className="flex cursor-pointer flex-col items-center gap-1"
                  >
                    <span className="font-mono text-[10px] text-[var(--muted)]">{letter}</span>
                    <input type="checkbox" name={`day${i}`} defaultChecked={i >= 1 && i <= 5} />
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center gap-2">
              <input type="checkbox" name="observesHolidays" defaultChecked />
              <span>Closed on public holidays</span>
            </label>

            <fieldset className="flex flex-col gap-1">
              <legend className="label">People needed, per day</legend>
              <div className="flex gap-1">
                {DAY_LETTERS.map((letter, i) => (
                  <label key={i} title={`Minimum on ${DAY_FULL[i]}`} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--faint)]">{letter}</span>
                    <input
                      type="number"
                      name={`min${i}`}
                      defaultValue={1}
                      min={1}
                      max={20}
                      className="w-11 px-1 text-center"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((line) => (
          <Card key={line.id}>
            <form action={saveLineAction} className="flex flex-wrap items-end gap-x-4 gap-y-3 text-sm">
              <input type="hidden" name="id" value={line.id} />

              <div className="min-w-[200px] flex-1">
                <div className="font-medium">{line.brand.name}</div>
                <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
                  <span>{line.process.name}</span>
                  <Chip>{describeCalendar(line)}</Chip>
                  <Chip>{describeMinStaff(line)}</Chip>
                  <Chip tone={line._count.assignments === 1 ? "warn" : "neutral"}>
                    {line._count.assignments}{" "}
                    {line._count.assignments === 1 ? "person" : "people"}
                  </Chip>
                </div>
              </div>

              <fieldset className="flex flex-col gap-1">
                <legend className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Open on
                </legend>
                <div className="flex gap-1">
                  {DAY_LETTERS.map((letter, i) => (
                    <label
                      key={i}
                      title={DAY_FULL[i]}
                      className="flex cursor-pointer flex-col items-center gap-1"
                    >
                      <span className="font-mono text-[10px] text-[var(--muted)]">{letter}</span>
                      <input
                        type="checkbox"
                        name={`day${i}`}
                        defaultChecked={line.weekdayMask[i]}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="observesHolidays"
                  defaultChecked={line.observesHolidays}
                />
                <span>Closed on holidays</span>
              </label>

              <fieldset className="flex flex-col gap-1">
                <legend className="label">People needed, per day</legend>
                <div className="flex gap-1">
                  {DAY_LETTERS.map((letter, i) => (
                    <label
                      key={i}
                      title={`Minimum on ${DAY_FULL[i]}`}
                      className="flex flex-col items-center gap-1"
                    >
                      <span
                        className={`text-[10px] ${
                          line.weekdayMask[i] ? "text-[var(--faint)]" : "text-[var(--line-strong)]"
                        }`}
                      >
                        {letter}
                      </span>
                      <input
                        type="number"
                        name={`min${i}`}
                        defaultValue={line.minStaffByWeekday[i] ?? 1}
                        min={1}
                        max={20}
                        disabled={!line.weekdayMask[i]}
                        title={
                          line.weekdayMask[i]
                            ? `Minimum on ${DAY_FULL[i]}`
                            : `${DAY_FULL[i]} is closed, so no minimum applies`
                        }
                        className="w-11 px-1 text-center disabled:opacity-35"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Note
                </span>
                <input
                  type="text"
                  name="notes"
                  defaultValue={line.notes ?? ""}
                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5"
                />
              </label>

              <SubmitButton>Save</SubmitButton>
            </form>

            <form action={deleteLineAction} className="mt-2">
              <input type="hidden" name="id" value={line.id} />
              <button
                type="submit"
                className="text-xs text-[var(--muted)] hover:text-[var(--crit)] hover:underline"
              >
                Remove this service
              </button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
