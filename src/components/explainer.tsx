import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Pieces that explain the app to someone who has never seen it.
 *
 * A reviewer opens this link cold, knowing nothing about the domain. If the
 * first screen is a wall of numbers, they have to reverse-engineer the problem
 * from the solution.
 */

/** The three-way tension the whole app exists to resolve. */
export function WhatIsThis() {
  const columns = [
    {
      tone: "accent" as const,
      heading: "What the clients want",
      body: (
        <>
          Somebody on duty every day they have paid for. One brand needs cover{" "}
          <strong>all 365 days</strong>, public holidays included. Another closes on Sundays.
          A single client can even run <strong>two services on two different calendars</strong>.
        </>
      ),
    },
    {
      tone: "ok" as const,
      heading: "What the staff need",
      body: (
        <>
          <strong>One day off every week</strong>, plus any approved leave. That is not
          negotiable &mdash; which means nobody can work more than six days in a week.
        </>
      ),
    },
    {
      tone: "crit" as const,
      heading: "Why the two collide",
      body: (
        <>
          <strong>18 of the 22 clients are covered by one person.</strong> The moment that
          person takes their day off, their client has nobody. And many staff cover several
          clients, so one day off can break three accounts at once.
        </>
      ),
    },
  ];

  const toneBar = {
    accent: "bg-[var(--accent)]",
    ok: "bg-[var(--ok)]",
    crit: "bg-[var(--crit)]",
  };

  return (
    <section className="mb-10">
      <div className="mb-5 max-w-3xl">
        <div className="label mb-2">The problem</div>
        <h2 className="text-[1.375rem] leading-snug">
          Two groups of people need incompatible things from the same calendar.
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((c) => (
          <div
            key={c.heading}
            className="relative overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] p-5 pl-6 shadow-[var(--shadow-sm)]"
          >
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 w-[3px] ${toneBar[c.tone]}`}
            />
            <h3 className="mb-2">{c.heading}</h3>
            <p className="text-[14px] leading-relaxed text-[var(--muted)]">{c.body}</p>
          </div>
        ))}
      </div>

      {/* The punchline, given the weight it deserves */}
      <div className="mt-4 overflow-hidden rounded-[var(--radius)] bg-[var(--header)] px-6 py-5 shadow-[var(--shadow-md)]">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
          The case this app is built around
        </div>
        <p className="max-w-4xl text-[15px] leading-relaxed text-[var(--header-ink)]">
          If one person covers a client that needs somebody{" "}
          <strong className="text-white">seven days a week</strong>, then{" "}
          <strong className="text-white">no schedule can work</strong> &mdash; they would have to
          work every single day of the month. That is not a scheduling mistake, it is
          arithmetic, and the only real fixes are hiring somebody or renegotiating the contract.
          Most tools would quietly hand back a broken rota. This one does the sums first and
          says so plainly.
        </p>
      </div>
    </section>
  );
}

/** A numbered walkthrough so a first-time visitor knows where to click. */
export function GuidedTour({ month }: { month: string }) {
  const steps: { href: string; title: string; body: ReactNode }[] = [
    {
      href: `/brands?month=${month}`,
      title: "See the clients",
      body: (
        <>
          Count how many say <strong>one person</strong>, and find{" "}
          <strong>Castellan Leather</strong> &mdash; one client, two different calendars.
        </>
      ),
    },
    {
      href: `/roster/company?month=${month}`,
      title: "Read the schedule",
      body: (
        <>
          32 people across 31 days. <strong>Hover any square</strong> for the reason that
          person is working or off.
        </>
      ),
    },
    {
      href: `/conflicts?month=${month}`,
      title: "See what it found",
      body: (
        <>
          The screen that matters most. It names the uncovered client, the cause, and{" "}
          <strong>a colleague who could fill in</strong>.
        </>
      ),
    },
    {
      href: `/leave?month=${month}`,
      title: "Break something",
      body: (
        <>
          Request leave and see the damage before approving. Try{" "}
          <strong>Faisal Khan</strong>, then <strong>Karthik Subramanian</strong>.
        </>
      ),
    },
    {
      href: "/admin/lines",
      title: "Type a rule in English",
      body: (
        <>
          &ldquo;Mon-Sat, closed on public holidays, at least two agents&rdquo; fills the form
          in. Nothing saves until you confirm.
        </>
      ),
    },
  ];

  return (
    <section className="mb-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label mb-2">Guided tour</div>
          <h2 className="text-[1.375rem] leading-snug">New here? Follow these five.</h2>
        </div>
        <p className="max-w-sm text-[13.5px] text-[var(--muted)]">
          Each takes a few seconds and shows a different face of the problem.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.href} className="flex">
            <Link
              href={s.href}
              className="group flex w-full flex-col rounded-[var(--radius)] bg-[var(--surface)] p-4 no-underline shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:no-underline"
            >
              <span className="mb-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12.5px] font-bold text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
                {i + 1}
              </span>
              <span className="mb-1.5 block text-[14.5px] font-semibold text-[var(--ink)]">
                {s.title}
              </span>
              <span className="block text-[13px] leading-relaxed text-[var(--muted)]">
                {s.body}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A short "what am I looking at" note for the top of any page.
 * Every screen gets one, so nobody has to guess.
 */
export function PageNote({ children }: { children: ReactNode }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] py-4 pl-6 pr-5 shadow-[var(--shadow-sm)]">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" />
      <p className="max-w-4xl text-[14px] leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  );
}

/** Inline glossary term with a hover definition. */
export function Term({ word, means }: { word: string; means: string }) {
  return (
    <abbr
      title={means}
      className="cursor-help border-b border-dotted border-[var(--faint)] no-underline"
    >
      {word}
    </abbr>
  );
}
