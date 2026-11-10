/**
 * The scheduling engine.
 *
 * Five passes, all deterministic. No solver library, on purpose: a solver
 * turns the interesting part into a black box, and "the solver decided" is a
 * poor answer to "why is Priya working on Sunday?". An explicit cost function
 * can answer that in a sentence, which is what this domain actually needs.
 *
 *   1  build the demand matrix          what each line of work needs, per day
 *   2  pin what cannot move             leave, holidays, manual locks
 *   3  place weekly offs by cost        the heart of the engine
 *   4  repair under-covered days        local swaps within the same week
 *   5  re-validate from scratch         and explain every finding
 *
 * Pass 5 deliberately re-checks every rule against the finished grid rather
 * than trusting that passes 3 and 4 got it right. It is easy to write logic
 * that *should* produce a valid roster; it is much safer to check the artefact.
 */

import {
  datesInMonth,
  datesInWeek,
  isOperatingDay,
  minStaffOn,
  weekBucketOf,
  weekBuckets,
  weekdayOf,
} from "./calendar";
import { describeChoice, rankBackups } from "./backups";
import { checkEmployeeCommitments, checkFeasibility, labelOf } from "./feasibility";
import type {
  DayState,
  Result,
  ResultDay,
  ResultViolation,
  Scorecard,
  Snapshot,
  SnapBrandProcess,
} from "./types";

// ---------------------------------------------------------------------------
// Cost weights
//
// The ordering carries the brief's hard-versus-soft distinction. BREAKS_COVER
// is large enough that no stack of preferences can ever outvote a client
// commitment -- 1000 beats every other term combined, many times over.
// ---------------------------------------------------------------------------

const COST = {
  /**
   * Taking this day off would drop a line of work below its minimum.
   * Large enough that no stack of soft terms can ever outvote it: the other
   * three combined cannot realistically exceed ~500 even in a big team.
   */
  BREAKS_COVER: 1000,

  /** This is not the employee's preferred weekly off. */
  NOT_PREFERRED: 50,

  /**
   * Leaves an unbroken run of working days above the employee's limit,
   * scored per day of excess. Weighted so a small overrun (1-2 days) loses to
   * the preference, but a serious one (3+ days) wins -- you can keep your
   * Sunday unless it means working nine days straight.
   */
  LONG_RUN: 20,

  /**
   * Mild tiebreak: how many colleagues are already off on this day. Spreads
   * days off across the team.
   *
   * Weight is deliberately 1, not 10. With 32 employees this term can reach
   * ~32, and at weight 10 it reached ~320 -- which silently outranked
   * NOT_PREFERRED and dragged almost everyone off their preferred day. It is a
   * tiebreak between otherwise equal options, so it must stay below 50.
   */
  CROWDED_DAY: 1,
} as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Bounded so the repair pass always terminates. */
const MAX_REPAIR_ATTEMPTS = 2000;

// ---------------------------------------------------------------------------
// Internal grid
// ---------------------------------------------------------------------------

type Cell = { state: DayState; reason: string; isLocked: boolean };
/** employeeId -> date -> Cell */
type Grid = Map<string, Map<string, Cell>>;

function getCell(grid: Grid, employeeId: string, date: string): Cell | undefined {
  return grid.get(employeeId)?.get(date);
}

function setCell(grid: Grid, employeeId: string, date: string, cell: Cell): void {
  let row = grid.get(employeeId);
  if (!row) {
    row = new Map();
    grid.set(employeeId, row);
  }
  row.set(date, cell);
}

function isWorking(grid: Grid, employeeId: string, date: string): boolean {
  return getCell(grid, employeeId, date)?.state === "WORKING";
}

// ---------------------------------------------------------------------------
// Pass 1 — demand matrix
// ---------------------------------------------------------------------------

/** brandProcessId -> date -> people required (absent means zero). */
type Demand = Map<string, Map<string, number>>;

function buildDemand(snap: Snapshot): Demand {
  const demand: Demand = new Map();
  for (const bp of snap.brandProcesses) {
    const perDate = new Map<string, number>();
    for (const date of datesInMonth(snap.month)) {
      if (isOperatingDay(bp, date, snap.holidays)) {
        perDate.set(date, minStaffOn(bp, date));
      }
    }
    demand.set(bp.id, perDate);
  }
  return demand;
}

/** How many assigned people are working this line of work on this date. */
function coverOn(
  grid: Grid,
  bp: SnapBrandProcess,
  date: string
): number {
  let n = 0;
  for (const id of bp.employeeIds) {
    if (isWorking(grid, id, date)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Pass 2 — pin what cannot move
// ---------------------------------------------------------------------------

function pinImmovables(snap: Snapshot, grid: Grid): void {
  const dates = datesInMonth(snap.month);

  // Default everything to working. Passes 3 and 4 carve out the offs.
  for (const emp of snap.employees) {
    for (const date of dates) {
      setCell(grid, emp.id, date, {
        state: "WORKING",
        reason: "Working day",
        isLocked: false,
      });
    }
  }

  // Approved leave. A hard constraint -- never scheduled over.
  for (const leave of snap.leaves) {
    if (!leave.date.startsWith(snap.month)) continue;
    if (!grid.has(leave.employeeId)) continue;

    const state: DayState = leave.type === "COMP_OFF" ? "COMP_OFF" : "LEAVE";
    const label =
      leave.type === "PLANNED" ? "planned leave"
      : leave.type === "SICK" ? "sick leave"
      : "approved comp-off";

    setCell(grid, leave.employeeId, leave.date, {
      state,
      reason: `Approved ${label}. This cannot be moved.`,
      isLocked: true,
    });
  }

  // Manual edits from a previous run. Respecting these is what lets a manager
  // fix something by hand without regeneration wiping it out.
  for (const lock of snap.locks ?? []) {
    if (!lock.date.startsWith(snap.month)) continue;
    if (!grid.has(lock.employeeId)) continue;
    setCell(grid, lock.employeeId, lock.date, {
      state: lock.state,
      reason: lock.reason || "Set by hand by the operations manager.",
      isLocked: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Pass 3 — place weekly offs by cost
// ---------------------------------------------------------------------------

/** Lines of work this employee can cover. */
function linesFor(snap: Snapshot, employeeId: string): SnapBrandProcess[] {
  return snap.brandProcesses.filter((bp) => bp.employeeIds.includes(employeeId));
}

/**
 * How many lines of work would fall below their minimum if this employee took
 * this date off. This is the term that must dominate.
 */
function coverageBreaks(
  snap: Snapshot,
  grid: Grid,
  employeeId: string,
  date: string,
  lines: SnapBrandProcess[]
): number {
  let breaks = 0;
  for (const bp of lines) {
    if (!isOperatingDay(bp, date, snap.holidays)) continue;
    const current = coverOn(grid, bp, date);
    // Only counts if this person is actually providing cover right now.
    if (!isWorking(grid, employeeId, date)) continue;
    if (current - 1 < minStaffOn(bp, date)) breaks++;
  }
  return breaks;
}

/** How many people across the team are already off on this date. */
function crowdedness(snap: Snapshot, grid: Grid, date: string): number {
  let n = 0;
  for (const emp of snap.employees) {
    const state = getCell(grid, emp.id, date)?.state;
    if (state && state !== "WORKING") n++;
  }
  return n;
}

/**
 * Penalty for leaving a long unbroken run of working days around this date.
 * Measured as the longest run that would remain if `date` became the day off.
 */
function longestRunIfOff(
  snap: Snapshot,
  grid: Grid,
  employeeId: string,
  date: string,
  maxConsecutive: number
): number {
  const dates = datesInMonth(snap.month);
  let longest = 0;
  let run = 0;
  for (const d of dates) {
    const off = d === date || getCell(grid, employeeId, d)?.state !== "WORKING";
    if (off) {
      longest = Math.max(longest, run);
      run = 0;
    } else {
      run++;
    }
  }
  longest = Math.max(longest, run);
  return Math.max(0, longest - maxConsecutive);
}

function costOfOff(
  snap: Snapshot,
  grid: Grid,
  employeeId: string,
  date: string,
  lines: SnapBrandProcess[],
  preferredWeeklyOff: number,
  maxConsecutive: number
): number {
  return (
    COST.BREAKS_COVER * coverageBreaks(snap, grid, employeeId, date, lines) +
    COST.NOT_PREFERRED * (weekdayOf(date) === preferredWeeklyOff ? 0 : 1) +
    COST.CROWDED_DAY * crowdedness(snap, grid, date) +
    COST.LONG_RUN * longestRunIfOff(snap, grid, employeeId, date, maxConsecutive)
  );
}

/** Explain, in a sentence, why this date became the weekly off. */
function explainOff(
  snap: Snapshot,
  grid: Grid,
  employeeId: string,
  date: string,
  lines: SnapBrandProcess[],
  preferredWeeklyOff: number
): string {
  const got = weekdayOf(date) === preferredWeeklyOff;
  const pref = DAY_NAMES[preferredWeeklyOff];

  if (got) {
    const closed = lines.filter((bp) => !isOperatingDay(bp, date, snap.holidays));
    if (closed.length === lines.length && lines.length > 0) {
      return `Weekly off on ${pref}, as preferred. Every line of work this person ` +
        `covers is closed that day anyway.`;
    }
    return `Weekly off on ${pref}, as preferred.`;
  }

  const breaksOnPreferred = lines.filter((bp) => {
    const prefDate = datesInWeek(snap.month, weekBucketOf(date, snap.month)).find(
      (d) => weekdayOf(d) === preferredWeeklyOff
    );
    if (!prefDate) return false;
    return isOperatingDay(bp, prefDate, snap.holidays) &&
      coverOn(grid, bp, prefDate) - 1 < minStaffOn(bp, prefDate);
  });

  if (breaksOnPreferred.length > 0) {
    const which = breaksOnPreferred.slice(0, 2).map(labelOf).join(" and ");
    const more = breaksOnPreferred.length > 2 ? ` and ${breaksOnPreferred.length - 2} more` : "";
    return `Weekly off moved to ${DAY_NAMES[weekdayOf(date)]}. Preferred ${pref} off was ` +
      `not possible because ${which}${more} would have had nobody on duty.`;
  }

  return `Weekly off on ${DAY_NAMES[weekdayOf(date)]} instead of the preferred ${pref}, ` +
    `to spread days off more evenly across the team.`;
}

function placeWeeklyOffs(snap: Snapshot, grid: Grid): void {
  const buckets = weekBuckets(snap.month);

  // Most-constrained-first. Someone with a single feasible off day should claim
  // it before someone with five choices takes it from them. "Constrainedness"
  // is approximated by how many lines of work the person solely covers.
  const order = [...snap.employees].sort((a, b) => {
    const soleA = snap.brandProcesses.filter(
      (bp) => bp.employeeIds.includes(a.id) && bp.employeeIds.length === 1
    ).length;
    const soleB = snap.brandProcesses.filter(
      (bp) => bp.employeeIds.includes(b.id) && bp.employeeIds.length === 1
    ).length;
    if (soleA !== soleB) return soleB - soleA;
    const linesA = snap.brandProcesses.filter((bp) => bp.employeeIds.includes(a.id)).length;
    const linesB = snap.brandProcesses.filter((bp) => bp.employeeIds.includes(b.id)).length;
    if (linesA !== linesB) return linesB - linesA;
    return a.code.localeCompare(b.code); // keeps the run deterministic
  });

  for (const emp of order) {
    const lines = linesFor(snap, emp.id);

    for (const bucket of buckets) {
      const week = datesInWeek(snap.month, bucket);

      // Already has a non-working day this week (leave, comp-off, manual lock)?
      // Then the weekly off is satisfied and nothing needs placing.
      const alreadyOff = week.some((d) => {
        const c = getCell(grid, emp.id, d);
        return c && c.state !== "WORKING";
      });
      if (alreadyOff) continue;

      const candidates = week.filter((d) => !getCell(grid, emp.id, d)?.isLocked);
      if (candidates.length === 0) continue;

      let best = candidates[0];
      let bestCost = Number.POSITIVE_INFINITY;
      for (const d of candidates) {
        const c = costOfOff(snap, grid, emp.id, d, lines, emp.preferredWeeklyOff, emp.maxConsecutiveDays);
        if (c < bestCost) {
          bestCost = c;
          best = d;
        }
      }

      setCell(grid, emp.id, best, {
        state: "WEEKLY_OFF",
        reason: explainOff(snap, grid, emp.id, best, lines, emp.preferredWeeklyOff),
        isLocked: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 4 — repair under-covered days
// ---------------------------------------------------------------------------

type Gap = { bp: SnapBrandProcess; date: string; have: number; need: number };

function findGaps(snap: Snapshot, grid: Grid, demand: Demand): Gap[] {
  const gaps: Gap[] = [];
  for (const bp of snap.brandProcesses) {
    const perDate = demand.get(bp.id);
    if (!perDate) continue;
    for (const [date, need] of perDate) {
      const have = coverOn(grid, bp, date);
      if (have < need) gaps.push({ bp, date, have, need });
    }
  }
  return gaps;
}

/** Total cost of all currently placed weekly offs. Used to accept/reject moves. */
function totalGapCount(snap: Snapshot, grid: Grid, demand: Demand): number {
  return findGaps(snap, grid, demand).reduce((n, g) => n + (g.need - g.have), 0);
}

/**
 * Try to fix gaps by moving a weekly off to another day in the same week.
 *
 * Bounded by MAX_REPAIR_ATTEMPTS and only accepts a move that strictly reduces
 * the total shortfall, so it cannot cycle and always terminates.
 */
function repair(
  snap: Snapshot,
  grid: Grid,
  demand: Demand
): { attempts: number; applied: number } {
  let attempts = 0;
  let applied = 0;

  for (let round = 0; round < 10; round++) {
    const gaps = findGaps(snap, grid, demand);
    if (gaps.length === 0) break;

    let changedThisRound = false;

    for (const gap of gaps) {
      if (attempts >= MAX_REPAIR_ATTEMPTS) break;

      // Who could cover this gap? Someone assigned to it who is off that day
      // on a movable weekly off.
      const candidates = gap.bp.employeeIds.filter((id) => {
        const cell = getCell(grid, id, gap.date);
        return cell && cell.state === "WEEKLY_OFF" && !cell.isLocked;
      });

      for (const employeeId of candidates) {
        if (attempts >= MAX_REPAIR_ATTEMPTS) break;

        const bucket = weekBucketOf(gap.date, snap.month);
        const week = datesInWeek(snap.month, bucket);
        const alternatives = week.filter(
          (d) => d !== gap.date && !getCell(grid, employeeId, d)?.isLocked &&
            getCell(grid, employeeId, d)?.state === "WORKING"
        );

        const before = totalGapCount(snap, grid, demand);
        const originalGapCell = getCell(grid, employeeId, gap.date)!;

        let bestAlt: string | null = null;
        let bestAfter = before;

        for (const alt of alternatives) {
          attempts++;
          const originalAltCell = getCell(grid, employeeId, alt)!;

          // Tentatively swap: work the gap day, take `alt` off instead.
          setCell(grid, employeeId, gap.date, {
            state: "WORKING",
            reason: "tentative",
            isLocked: false,
          });
          setCell(grid, employeeId, alt, {
            state: "WEEKLY_OFF",
            reason: "tentative",
            isLocked: false,
          });

          const after = totalGapCount(snap, grid, demand);

          // Undo before judging, so each candidate is measured independently.
          setCell(grid, employeeId, gap.date, originalGapCell);
          setCell(grid, employeeId, alt, originalAltCell);

          if (after < bestAfter) {
            bestAfter = after;
            bestAlt = alt;
          }
        }

        if (bestAlt) {
          const bpLabel = labelOf(gap.bp);
          setCell(grid, employeeId, gap.date, {
            state: "WORKING",
            reason:
              `Working instead of taking this day off, because ${bpLabel} needs ` +
              `${gap.need} on duty and would otherwise have ${gap.have}.`,
            isLocked: false,
          });
          setCell(grid, employeeId, bestAlt, {
            state: "WEEKLY_OFF",
            reason:
              `Weekly off moved here from ${gap.date} so that ${bpLabel} stayed covered.`,
            isLocked: false,
          });
          applied++;
          changedThisRound = true;
          break; // this gap is handled; move to the next
        }
      }
    }

    if (!changedThisRound) break;
  }

  return { attempts, applied };
}

// ---------------------------------------------------------------------------
// Pass 5 — re-validate everything and explain
// ---------------------------------------------------------------------------

function validate(
  snap: Snapshot,
  grid: Grid,
  demand: Demand
): ResultViolation[] {
  const out: ResultViolation[] = [];
  const empById = new Map(snap.employees.map((e) => [e.id, e]));

  // --- coverage gaps (HARD) ---
  for (const gap of findGaps(snap, grid, demand)) {
    const { bp, date, have, need } = gap;

    // Who is unavailable, and why? This is the evidence behind the finding.
    const away = bp.employeeIds
      .map((id) => ({ emp: empById.get(id)!, cell: getCell(grid, id, date) }))
      .filter((x) => x.emp && x.cell && x.cell.state !== "WORKING");

    const awayText = away
      .map((x) => `${x.emp.name} (${describeState(x.cell!.state)})`)
      .join(", ");

    // Candidates, ranked. Not "whoever the database returned first" -- the
    // best candidate is the one who is qualified AND least loaded, since
    // piling work onto somebody already stretched is how an over-commitment
    // is created while closing a gap.
    const candidates = rankBackups(snap, bp, date, (id, d) => isWorking(grid, id, d));
    const backup = candidates[0];

    let suggestion: string;
    if (backup) {
      suggestion =
        `Assign ${backup.name} to ${labelOf(bp)} to close this gap. ` +
        describeChoice(backup, candidates.length);
    } else if (bp.employeeIds.length === 1) {
      suggestion =
        `${labelOf(bp)} has only one person assigned and nobody else covers ` +
        `${bp.processName}. This gap cannot be closed by rescheduling -- it needs ` +
        `another trained resource, or a change to the operating calendar.`;
    } else {
      suggestion =
        `Nobody qualified on ${bp.processName} is available on this date. ` +
        `Either reduce the minimum of ${need} for this weekday, or train another resource.`;
    }

    out.push({
      date,
      severity: "HARD",
      kind: "COVERAGE_GAP",
      brandProcessId: bp.id,
      message:
        `${labelOf(bp)} needs ${need} on duty but has ${have}. ` +
        (awayText ? `Unavailable: ${awayText}.` : `Nobody assigned is working.`),
      suggestion,
      // Kept so the suggestion can be acted on, not just read. Only set when
      // a specific person was found -- a shortfall with no candidate has no
      // single action to offer.
      suggestedEmployeeId: backup?.employeeId,
    });
  }

  // --- weekly off entitlement (HARD) ---
  for (const emp of snap.employees) {
    for (const bucket of weekBuckets(snap.month)) {
      const week = datesInWeek(snap.month, bucket);
      // A one-day partial week at a month boundary cannot fairly be required
      // to contain a day off -- the rest of that week sits in another month.
      if (week.length < 3) continue;

      const hasOff = week.some((d) => getCell(grid, emp.id, d)?.state !== "WORKING");
      if (!hasOff) {
        out.push({
          date: week[0],
          severity: "HARD",
          kind: "NO_WEEKLY_OFF",
          employeeId: emp.id,
          message:
            `${emp.name} has no day off in the week of ${week[0]}. ` +
            `A weekly off is a hard rule and cannot be traded for coverage.`,
          suggestion:
            `Something has to give on one of ${week.join(", ")}. Either another ` +
            `resource covers one of those days, or a client's required coverage ` +
            `has to change.`,
        });
      }
    }
  }

  // --- preference overridden (SOFT) ---
  for (const emp of snap.employees) {
    for (const bucket of weekBuckets(snap.month)) {
      const week = datesInWeek(snap.month, bucket);
      if (week.length < 3) continue;

      const offDays = week.filter((d) => getCell(grid, emp.id, d)?.state === "WEEKLY_OFF");
      if (offDays.length === 0) continue;
      if (offDays.some((d) => weekdayOf(d) === emp.preferredWeeklyOff)) continue;

      // Only report if their preferred day actually existed in this week.
      const preferredExists = week.some((d) => weekdayOf(d) === emp.preferredWeeklyOff);
      if (!preferredExists) continue;

      out.push({
        date: offDays[0],
        severity: "SOFT",
        kind: "PREFERENCE_OVERRIDDEN",
        employeeId: emp.id,
        message:
          `${emp.name} prefers ${DAY_NAMES[emp.preferredWeeklyOff]} off but was given ` +
          `${DAY_NAMES[weekdayOf(offDays[0])]} in the week of ${week[0]}.`,
        suggestion: getCell(grid, emp.id, offDays[0])?.reason,
      });
    }
  }

  // --- consecutive working days (SOFT) ---
  for (const emp of snap.employees) {
    let run = 0;
    let runStart = "";
    for (const date of datesInMonth(snap.month)) {
      if (isWorking(grid, emp.id, date)) {
        if (run === 0) runStart = date;
        run++;
      } else {
        if (run > emp.maxConsecutiveDays) {
          out.push({
            date: runStart,
            severity: "SOFT",
            kind: "CONSECUTIVE_DAYS",
            employeeId: emp.id,
            message:
              `${emp.name} works ${run} days in a row from ${runStart}, above the ` +
              `limit of ${emp.maxConsecutiveDays}.`,
            suggestion: `Move one of those days off earlier in the run if coverage allows.`,
          });
        }
        run = 0;
      }
    }
    if (run > emp.maxConsecutiveDays) {
      out.push({
        date: runStart,
        severity: "SOFT",
        kind: "CONSECUTIVE_DAYS",
        employeeId: emp.id,
        message:
          `${emp.name} works ${run} days in a row from ${runStart} to the end of the ` +
          `month, above the limit of ${emp.maxConsecutiveDays}.`,
        suggestion: `Move one of those days off earlier in the run if coverage allows.`,
      });
    }
  }

  return out;
}

function describeState(state: DayState): string {
  switch (state) {
    case "WEEKLY_OFF": return "weekly off";
    case "HOLIDAY": return "public holiday";
    case "LEAVE": return "on leave";
    case "COMP_OFF": return "comp-off";
    default: return "working";
  }
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function scorecard(
  snap: Snapshot,
  grid: Grid,
  demand: Demand,
  shortfallPersonDays: number
): Scorecard {
  // Coverage: satisfied brand-process-days over required ones.
  let required = 0;
  let satisfied = 0;
  for (const bp of snap.brandProcesses) {
    for (const [date, need] of demand.get(bp.id) ?? []) {
      required++;
      if (coverOn(grid, bp, date) >= need) satisfied++;
    }
  }

  // Preference: share of employee-weeks where the preferred day off was kept.
  //
  // Measured per employee-week rather than all-or-nothing per employee. A
  // person who keeps their Sunday three weeks out of four has largely been
  // looked after, and reporting that as a flat failure hides how good the
  // roster actually is. Weeks where the preferred weekday does not occur at
  // all are excluded rather than counted as failures.
  let prefEligible = 0;
  let prefKept = 0;
  const fullWeeks = weekBuckets(snap.month)
    .map((b) => datesInWeek(snap.month, b))
    .filter((w) => w.length >= 3);

  for (const emp of snap.employees) {
    for (const week of fullWeeks) {
      if (!week.some((d) => weekdayOf(d) === emp.preferredWeeklyOff)) continue;
      prefEligible++;
      const offs = week.filter((d) => getCell(grid, emp.id, d)?.state !== "WORKING");
      if (offs.some((d) => weekdayOf(d) === emp.preferredWeeklyOff)) prefKept++;
    }
  }

  // Fairness: standard deviation of Sunday-offs per person. A low spread means
  // weekend time off is shared rather than concentrated on a few people.
  const sundayOffs = snap.employees.map(
    (emp) =>
      datesInMonth(snap.month).filter(
        (d) => weekdayOf(d) === 0 && getCell(grid, emp.id, d)?.state !== "WORKING"
      ).length
  );
  const mean = sundayOffs.reduce((a, b) => a + b, 0) / (sundayOffs.length || 1);
  const variance =
    sundayOffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (sundayOffs.length || 1);

  return {
    coveragePct: required === 0 ? 100 : round1((satisfied / required) * 100),
    preferenceMetPct: prefEligible === 0 ? 100 : round1((prefKept / prefEligible) * 100),
    fairnessSpread: round2(Math.sqrt(variance)),
    shortfallPersonDays,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Internals exposed for testing only.
 *
 * Pass 4 (repair) rarely fires on realistic data, because pass 3 re-reads the
 * grid as it assigns and therefore avoids most gaps before they happen, and
 * because leave is pinned in pass 2 before any placement decisions are made.
 * On the sample dataset it applies zero repairs -- every remaining gap is the
 * unfixable kind, caused by leave on a line of work with nobody else on it.
 *
 * That makes it a safety net rather than a workhorse. It is kept because the
 * greedy pass is not provably optimal and the insurance is cheap, but a net
 * that never catches anything is also a net nobody has tested. So the repair
 * step is exported here and exercised directly against a deliberately bad
 * grid, rather than being left to chance.
 */
export const __testing = {
  buildDemand,
  pinImmovables,
  placeWeeklyOffs,
  repair,
  findGaps,
  totalGapCount,
  setCell,
  getCell,
  COST,
};

export function generateRoster(snap: Snapshot): Result {
  const dates = datesInMonth(snap.month);
  const buckets = weekBuckets(snap.month);

  // Step 0 — is this even possible? Runs first, independent of scheduling.
  //
  // Two halves. The first asks whether each client has enough person-days. The
  // second asks whether any one PERSON has enough days for everything only
  // they can cover -- a combination that is impossible even when every client
  // looks fine checked on its own.
  const feas = checkFeasibility(snap);
  const commitments = checkEmployeeCommitments(
    snap,
    new Set(feas.violations.map((v) => v.brandProcessId).filter(Boolean) as string[])
  );

  // Pass 1
  const demand = buildDemand(snap);

  // Pass 2
  const grid: Grid = new Map();
  pinImmovables(snap, grid);

  // Pass 3
  placeWeeklyOffs(snap, grid);
  const gapsBefore = totalGapCount(snap, grid, demand);

  // Pass 4
  const { attempts, applied } = repair(snap, grid, demand);
  const gapsAfter = totalGapCount(snap, grid, demand);

  // Pass 5
  const violations = [
    ...feas.violations,
    ...commitments.violations,
    ...validate(snap, grid, demand),
  ];

  // Flatten the grid for persistence.
  const days: ResultDay[] = [];
  for (const emp of snap.employees) {
    for (const date of dates) {
      const cell = getCell(grid, emp.id, date);
      if (!cell) continue;
      days.push({
        employeeId: emp.id,
        date,
        state: cell.state,
        reason: cell.reason,
        isLocked: cell.isLocked,
      });
    }
  }

  return {
    month: snap.month,
    days,
    violations,
    scorecard: scorecard(
      snap,
      grid,
      demand,
      feas.shortfallPersonDays + commitments.shortfallPersonDays
    ),
    stats: {
      datesInMonth: dates.length,
      weekBuckets: buckets.length,
      repairAttempts: attempts,
      repairsApplied: applied,
      gapsBefore,
      gapsAfter,
    },
  };
}
