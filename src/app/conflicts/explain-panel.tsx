import { explainMonth } from "@/lib/ai/explain";
import { aiStatus } from "@/lib/ai/providers";
import { Card, Chip, LinkButton } from "@/components/ui";

/**
 * The written summary panel.
 *
 * Split into its own async component so the conflicts page can stream: the
 * problem list renders immediately and this panel arrives when the model
 * answers. Before this, the whole page blocked on a request that takes
 * 20-50 seconds, which is indistinguishable from a broken app.
 */

const FOOTER = (
  <>
    The model is given the problems below and the reasons the scheduler already wrote when it
    made each decision. It summarises them. It does not choose who works when, and the
    schedule is identical whether or not this is ever run. Requests try Gemini first and fall
    back to Groq, so one provider being down or slow does not take the feature with it.
  </>
);

/** Shown immediately while the model is still thinking. */
export function ExplainSkeleton() {
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>Written summary</span>
          <Chip tone="accent">Writing…</Chip>
        </span>
      }
      footer={FOOTER}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--accent-line)] border-t-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--muted)]">
            Reading the {`month's`} problems and writing a briefing. This usually takes{" "}
            <strong>20 to 50 seconds</strong> &mdash; the model reasons before it writes.
          </p>
          <div className="mt-3 flex flex-col gap-2" aria-hidden>
            {[100, 96, 88, 70].map((w, i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-[var(--surface-2)]"
                style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** The call-to-action, before anybody has asked for a summary. */
export function ExplainPrompt({ month }: { month: string }) {
  const status = aiStatus();
  const enabled = status.enabled;
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>Written summary</span>
          {enabled ? (
            status.order.map((p) => (
              <Chip key={p} tone="accent">
                {p}
              </Chip>
            ))
          ) : (
            <Chip>unavailable &mdash; no API key</Chip>
          )}
        </span>
      }
      footer={FOOTER}
    >
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton
          href={`/conflicts?month=${month}&explain=1`}
          variant={enabled ? "primary" : "secondary"}
        >
          Explain this month
        </LinkButton>
        <span className="text-sm text-[var(--muted)]">
          {enabled ? (
            <>
              Turns the list below into a short briefing. Takes{" "}
              <strong>20 to 50 seconds</strong>.
            </>
          ) : (
            <>
              Set <code>GEMINI_API_KEY</code> or <code>GROQ_API_KEY</code> to enable this.
              Everything else works without it.
            </>
          )}
        </span>
      </div>
    </Card>
  );
}

/** The real thing. Awaits the model, so render it inside a Suspense boundary. */
export async function ExplainPanel({
  month,
  findingCount,
}: {
  month: string;
  findingCount: number;
}) {
  const result = await explainMonth(month);

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>Written summary</span>
          {result.ok ? (
            <Chip tone="accent">
              {result.provider} &middot; {result.model}
            </Chip>
          ) : (
            <Chip tone="warn">unavailable</Chip>
          )}
        </span>
      }
      footer={FOOTER}
    >
      {result.ok ? (
        <div className="flex flex-col gap-3">
          {result.text
            .split(/\n\s*\n/)
            .filter((p) => p.trim())
            .map((para, i) => (
              <p key={i} className="text-[14.5px] leading-relaxed text-[var(--ink-2)]">
                {para}
              </p>
            ))}
          <p className="mt-1 text-xs text-[var(--faint)]">
            Written by {result.provider} in {(result.ms / 1000).toFixed(1)}s from the{" "}
            {findingCount} findings below. The schedule itself was decided before this ran.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-[var(--warn)]">{result.message}</p>
          <LinkButton href={`/conflicts?month=${month}&explain=1`} variant="secondary">
            Try again
          </LinkButton>
        </div>
      )}
    </Card>
  );
}
