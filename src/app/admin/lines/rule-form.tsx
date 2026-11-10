import { createLineFromRuleAction } from "../actions";
import { parseRule } from "@/lib/ai/rule-parser";
import { aiStatus } from "@/lib/ai/providers";
import { describeMask } from "@/lib/ai/rule-rules";
import { Card, Chip, SubmitButton } from "@/components/ui";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Write a coverage rule in plain English and have it fill in the form.
 *
 * The parsed result is shown as an ORDINARY FORM, pre-filled and fully
 * editable, and nothing reaches the database until the manager presses Save.
 * That is the whole safety model: the parser suggests, a human confirms.
 */
export async function RuleForm({
  brands,
  processes,
  text,
}: {
  brands: { id: string; name: string }[];
  processes: { id: string; name: string }[];
  text?: string;
}) {
  const outcome = text ? await parseRule(text) : null;

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--ink)]">Describe a rule in plain English</span>
          {aiStatus().enabled ? (
            <Chip tone="accent">AI fallback: {aiStatus().order.join(" then ")}</Chip>
          ) : (
            <Chip>rules only &mdash; no API key</Chip>
          )}
        </span>
      }
      footer={
        <>
          The parser never saves anything itself. It fills in the form below, which you check
          and submit. Common phrasings are handled by plain pattern rules with no model call at
          all; a model is only asked about wording those rules do not recognise, trying Gemini
          first and falling back to Groq.
        </>
      }
    >
      <form method="get" className="flex flex-col gap-2">
        <label htmlFor="rule" className="sr-only">
          Coverage rule
        </label>
        <textarea
          id="rule"
          name="rule"
          rows={2}
          defaultValue={text ?? ""}
          placeholder="Support runs every day including public holidays, minimum 1 person."
          className="w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>Read it</SubmitButton>
          <span className="text-xs text-[var(--muted)]">
            Try: &ldquo;Mon-Sat, closed on public holidays, at least two agents&rdquo;
          </span>
        </div>
      </form>

      {outcome && !outcome.ok && (
        <div className="mt-4 rounded border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">
          {outcome.message}
        </div>
      )}

      {outcome && outcome.ok && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <strong className="text-sm text-[var(--accent)]">
                {outcome.rule.explanation}
              </strong>
              <Chip tone={outcome.rule.source === "ai" ? "accent" : "ok"}>
                {outcome.rule.source === "ai"
                  ? `read by ${outcome.rule.provider ?? "AI"}`
                  : "read by pattern rules"}
              </Chip>
            </div>
            <p className="text-xs text-[var(--muted)]">
              {describeMask(outcome.rule.weekdayMask)} &middot;{" "}
              {outcome.rule.observesHolidays
                ? "closed on public holidays"
                : "open on public holidays"}{" "}
              &middot; minimum {outcome.rule.minStaffPerDay}
            </p>
            {outcome.rule.warnings.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {outcome.rule.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-[var(--warn)]">
                    Assumed: {w}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            action={createLineFromRuleAction}
            className="flex flex-wrap items-end gap-3 rounded border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm"
          >
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
                    <input
                      type="checkbox"
                      name={`day${i}`}
                      defaultChecked={outcome.rule.weekdayMask[i]}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="observesHolidays"
                defaultChecked={outcome.rule.observesHolidays}
              />
              <span>Closed on public holidays</span>
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
                    <span className="text-[10px] text-[var(--faint)]">{letter}</span>
                    <input
                      type="number"
                      name={`min${i}`}
                      defaultValue={outcome.rule.minStaffPerDay}
                      min={1}
                      max={20}
                      className="w-11 px-1 text-center"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <input type="hidden" name="notes" value={text ?? ""} />
            <SubmitButton>Confirm and save</SubmitButton>
          </form>

          <p className="text-xs text-[var(--muted)]">
            Everything above is editable. Correct anything the parser got wrong before saving.
            The sentence gives one figure for every day; adjust individual days here if the
            client needs more on some than others.
          </p>
        </div>
      )}
    </Card>
  );
}
