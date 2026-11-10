/**
 * Shared presentation pieces.
 *
 * Hand-written rather than pulled from a component library: there are only a
 * handful, and every dependency is one more thing to justify.
 *
 * Cards carry a soft shadow rather than a hard border. With this many panels
 * on screen, borders everywhere turned the page into a grid of boxes with no
 * hierarchy; elevation separates them without adding visual noise.
 */

import Link from "next/link";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Day states
// ---------------------------------------------------------------------------

export type DayState = "WORKING" | "WEEKLY_OFF" | "HOLIDAY" | "LEAVE" | "COMP_OFF";

/**
 * Each state gets a letter as well as a colour, so the grid still reads for
 * someone who is colour-blind and still reads in a greyscale screenshot --
 * which matters, because this ends up in a demo video.
 */
export const DAY_STATE: Record<
  DayState,
  { letter: string; label: string; className: string }
> = {
  WORKING: {
    letter: "W",
    label: "Working",
    className: "bg-[var(--ok-soft)] text-[var(--ok)] ring-1 ring-inset ring-[var(--ok-line)]",
  },
  WEEKLY_OFF: {
    letter: "O",
    label: "Day off",
    className: "bg-[var(--surface-3)] text-[var(--muted)]",
  },
  HOLIDAY: {
    letter: "H",
    label: "Public holiday",
    className: "bg-[var(--surface-3)] text-[var(--muted)]",
  },
  LEAVE: {
    letter: "L",
    label: "On leave",
    className: "bg-[var(--warn-soft)] text-[var(--warn)] ring-1 ring-inset ring-[var(--warn-line)]",
  },
  COMP_OFF: {
    letter: "C",
    label: "Comp-off",
    className: "bg-[var(--warn-soft)] text-[var(--warn)] ring-1 ring-inset ring-[var(--warn-line)]",
  },
};

export function DayLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3.5 py-2.5 text-[12.5px] text-[var(--muted)] shadow-[var(--shadow-sm)]">
      <span className="label">Key</span>
      {(Object.keys(DAY_STATE) as DayState[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${DAY_STATE[s].className}`}
          >
            {DAY_STATE[s].letter}
          </span>
          {DAY_STATE[s].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--crit-soft)] text-[11px] font-semibold text-[var(--crit)] ring-1 ring-inset ring-[var(--crit-line)]">
          !
        </span>
        Nobody on duty
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "crit" | "accent";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--muted)] ring-[var(--line)]",
    ok: "bg-[var(--ok-soft)] text-[var(--ok)] ring-[var(--ok-line)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)] ring-[var(--warn-line)]",
    crit: "bg-[var(--crit-soft)] text-[var(--crit)] ring-[var(--crit-line)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent-line)]",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: "HARD" | "SOFT" }) {
  return severity === "HARD" ? (
    <Chip tone="crit">Must fix</Chip>
  ) : (
    <Chip tone="warn">Worth knowing</Chip>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="label mb-1.5">{eyebrow}</div>}
          <h1>{title}</h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[var(--muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-end gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  title,
  children,
  footer,
  pad = true,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  pad?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      {title && (
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-[14px] font-semibold tracking-normal">{title}</h2>
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
      {footer && (
        <div className="border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
          {footer}
        </div>
      )}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--ink)]">{title}</p>
      {children && (
        <div className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{children}</div>
      )}
    </div>
  );
}

/** A table that scrolls sideways on its own, so the page never does. */
export function Scroller({ children }: { children: ReactNode }) {
  return <div className="scroll-x">{children}</div>;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  unit,
  tone = "neutral",
  note,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: "neutral" | "ok" | "warn" | "crit";
  note?: string;
}) {
  const tones = {
    neutral: "text-[var(--ink)]",
    ok: "text-[var(--ok)]",
    warn: "text-[var(--warn)]",
    crit: "text-[var(--crit)]",
  };
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="label">{label}</div>
      <div className={`tnum mt-2 text-[1.75rem] font-semibold leading-none ${tones[tone]}`}>
        {value}
        {unit && <span className="ml-0.5 text-base font-normal">{unit}</span>}
      </div>
      {note && <div className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-2 text-[13.5px] font-medium no-underline transition-all hover:no-underline disabled:cursor-not-allowed disabled:opacity-45";

const BTN_PRIMARY =
  "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--accent-ink)] active:translate-y-[0.5px]";

const BTN_SECONDARY =
  "bg-[var(--surface)] text-[var(--ink)] ring-1 ring-inset ring-[var(--line-strong)] hover:bg-[var(--surface-2)] active:translate-y-[0.5px]";

const BTN_QUIET =
  "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]";

function styleFor(variant: "primary" | "secondary" | "quiet") {
  return variant === "primary" ? BTN_PRIMARY : variant === "quiet" ? BTN_QUIET : BTN_SECONDARY;
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <Link href={href} className={`${BTN_BASE} ${styleFor(variant)}`}>
      {children}
    </Link>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  disabled,
  title,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      title={title}
      className={`${BTN_BASE} ${styleFor(variant)}`}
    >
      {children}
    </button>
  );
}

/** A low-emphasis destructive action, for rows of data. */
export function QuietDanger({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded px-1.5 py-0.5 text-[12px] text-[var(--faint)] transition-colors hover:bg-[var(--crit-soft)] hover:text-[var(--crit)]"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export function Banner({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "crit" | "accent";
  title?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    ok: "bg-[var(--ok-soft)] text-[var(--ok)] ring-[var(--ok-line)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)] ring-[var(--warn-line)]",
    crit: "bg-[var(--crit-soft)] text-[var(--crit)] ring-[var(--crit-line)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent-line)]",
  };
  return (
    <div
      className={`rounded-[var(--radius)] px-4 py-3 text-sm leading-relaxed ring-1 ring-inset ${tones[tone]}`}
    >
      {title && <strong className="mr-1 text-current">{title}</strong>}
      {children}
    </div>
  );
}
