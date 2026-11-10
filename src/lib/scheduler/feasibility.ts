/**
 * Step 0 of generation: is this month even possible?
 *
 * This runs BEFORE any scheduling. It compares, for each line of work, the
 * person-days of coverage the client expects against the person-days the
 * assigned people can physically supply.
 *
 * Why it matters: consider one employee on a brand that needs support every
 * day of the year. No scheduling algorithm can solve that, because one person
 * cannot work seven days a week. An app that grinds through and then reports
 * five uncovered days has described a symptom. The honest finding is different
 * in kind -- this cannot be staffed, so hire someone or renegotiate the
 * calendar. Those need completely different decisions.
 *
 * CAPACITY MODEL -- the important subtlety.
 * An employee who is working on a date covers EVERY line of work they are
 * assigned to on that date. Being present is not consumed by one brand. So an
 * employee's available days are counted in full against each line of work they
 * cover, and are NOT divided between them.
 *
 * That is not a shortcut, it is how the work actually behaves: one agent on
 * shift answers tickets for both small brands they own. Dividing capacity
 * would invent shortfalls that do not exist.
 */

import { datesInMonth, minStaffOn, operatingDays, weekBuckets } from "./calendar";
import type { ResultViolation, Snapshot, SnapBrandProcess } from "./types";

export type CapacityReport = {
  brandProcessId: string;
  label: string;
  /** Person-days the client expects. */
  demand: number;
  /** Person-days the assigned people can supply. */
  capacity: number;
  /** capacity - demand. Negative means unstaffable. */
  slack: number;
  operatingDayCount: number;
  peopleCount: number;
  ownerCount: number;
};

/**
 * How many days in the month this employee could possibly work.
 *
 * Starts from every date, then removes:
 *   - one mandatory weekly off per week bucket the month touches
 *   - approved leave
 *
 * This is an upper bound on availability, which is what a feasibility check
 * needs. If demand exceeds even the upper bound, no schedule can exist.
 */
export function availableDayCount(employeeId: string, snap: Snapshot): number {
  const total = datesInMonth(snap.month).length;
  const mandatoryOffs = weekBuckets(snap.month).length;
  const leaveDays = snap.leaves.filter(
    (l) => l.employeeId === employeeId && l.date.startsWith(snap.month)
  ).length;

  // Leave can land on a day that would have been the weekly off anyway, so
  // this can over-subtract slightly. That makes the bound conservative, which
  // is the safe direction for a feasibility check: it never claims a month is
  // possible when it is not.
  return Math.max(0, total - mandatoryOffs - leaveDays);
}

export function labelOf(bp: SnapBrandProcess): string {
  return `${bp.brandName} / ${bp.processCode}`;
}

/** Capacity report for every line of work, worst slack first. */
export function capacityReport(snap: Snapshot): CapacityReport[] {
  return snap.brandProcesses
    .map((bp) => {
      const opDays = operatingDays(bp, snap);
      // Summed per day rather than multiplied by a single figure. Required now
      // that minimums vary by weekday, and strictly more accurate than the old
      // arithmetic ever was.
      const demand = opDays.reduce((sum, date) => sum + minStaffOn(bp, date), 0);
      const capacity = bp.employeeIds.reduce(
        (sum, id) => sum + availableDayCount(id, snap),
        0
      );
      return {
        brandProcessId: bp.id,
        label: labelOf(bp),
        demand,
        capacity,
        slack: capacity - demand,
        operatingDayCount: opDays.length,
        peopleCount: bp.employeeIds.length,
        ownerCount: bp.ownerIds.length,
      };
    })
    .sort((a, b) => a.slack - b.slack);
}

/**
 * Turn unstaffable lines of work into violations.
 *
 * These are month-level findings with no date attached, because the problem is
 * not located on any particular day -- it is the shape of the staffing.
 */
export function checkFeasibility(snap: Snapshot): {
  violations: ResultViolation[];
  reports: CapacityReport[];
  shortfallPersonDays: number;
} {
  const reports = capacityReport(snap);
  const violations: ResultViolation[] = [];
  let shortfallPersonDays = 0;

  for (const r of reports) {
    if (r.slack >= 0) continue;

    const short = -r.slack;
    shortfallPersonDays += short;

    const bp = snap.brandProcesses.find((b) => b.id === r.brandProcessId)!;
    const names = bp.employeeIds
      .map((id) => snap.employees.find((e) => e.id === id)?.name)
      .filter(Boolean)
      .join(", ");

    const perPersonDays = r.peopleCount > 0 ? r.capacity / r.peopleCount : 0;
    const extraPeopleNeeded = perPersonDays > 0 ? Math.ceil(short / perPersonDays) : 1;

    violations.push({
      date: null,
      severity: "HARD",
      kind: "STAFFING_SHORTFALL",
      brandProcessId: bp.id,
      message:
        `${r.label} cannot be staffed this month. It needs ${r.demand} person-days ` +
        `of cover across ${r.operatingDayCount} operating days, but the ` +
        `${r.peopleCount === 1 ? "one person" : `${r.peopleCount} people`} assigned ` +
        `(${names}) can supply at most ${r.capacity}. Short by ${short} person-days.`,
      suggestion:
        r.peopleCount === 1
          ? `One person cannot cover ${r.operatingDayCount} days in a month while taking ` +
            `a weekly off. Assign at least ${extraPeopleNeeded} more ` +
            `${extraPeopleNeeded === 1 ? "person" : "people"} to ${r.label}, or change the ` +
            `operating calendar so it closes at least one day a week. ` +
            `No schedule can fix this.`
          : `Add ${extraPeopleNeeded} more ${extraPeopleNeeded === 1 ? "person" : "people"} ` +
            `to ${r.label}, reduce its daily minimum, or close ` +
            `more days. No schedule can fix this.`,
    });
  }

  return { violations, reports, shortfallPersonDays };
}

// ---------------------------------------------------------------------------
// The other half of feasibility: is any one PERSON over-committed?
//
// capacityReport above asks "does this client have enough person-days?". That
// misses the mirror-image failure, which the brief names as "an employee being
// assigned to overlapping responsibilities":
//
//   Pooja owns Client A (Mon-Sat) and Client B (Sundays only).
//   Client A alone: needs 26 days, she can work 26.  Fine.
//   Client B alone: needs 4 days, she can work 26.   Fine.
//   Together:       they need all 7 days a week.     Impossible.
//
// Checked per-client, nothing is wrong. The person is the thing that cannot
// stretch. Without this check the app reports four COVERAGE_GAPs blaming
// "Pooja is on her weekly off", which is the symptom, and never states that
// no schedule could have worked.
// ---------------------------------------------------------------------------

export type CommitmentReport = {
  employeeId: string;
  name: string;
  /** Dates on which this person is the difference between covered and not. */
  indispensableDays: string[];
  /** Days they could actually work. */
  availableDays: number;
  /** availableDays - indispensableDays.length. Negative means impossible. */
  slack: number;
  /** Which lines of work make them indispensable. */
  lines: string[];
};

/**
 * An employee is INDISPENSABLE to a line of work on a date when removing them
 * would drop it below its minimum -- i.e. the other assignees cannot cover it
 * between them. For a sole owner that is every operating day; for one of three
 * people with a minimum of two it is never.
 */
export function commitmentReport(snap: Snapshot): CommitmentReport[] {
  return snap.employees
    .map((emp) => {
      const required = new Set<string>();
      const lines: string[] = [];

      for (const bp of snap.brandProcesses) {
        if (!bp.employeeIds.includes(emp.id)) continue;
        // Indispensable only on dates where the others could not meet that
        // day's minimum between them. With minimums varying by weekday this
        // has to be decided per date, not once per line of work.
        const days = operatingDays(bp, snap).filter(
          (d) => bp.employeeIds.length - 1 < minStaffOn(bp, d)
        );
        if (days.length === 0) continue;

        lines.push(labelOf(bp));
        for (const date of days) required.add(date);
      }

      const availableDays = availableDayCount(emp.id, snap);
      return {
        employeeId: emp.id,
        name: emp.name,
        indispensableDays: [...required].sort(),
        availableDays,
        slack: availableDays - required.size,
        lines,
      };
    })
    .filter((r) => r.indispensableDays.length > 0)
    .sort((a, b) => a.slack - b.slack);
}

/**
 * Report over-committed people as violations.
 *
 * `alreadyShortLineIds` are lines of work that capacityReport has already
 * flagged. An employee implicated only in those is suppressed, because it is
 * the same fact reported at a different level and saying it twice would make
 * the problem list look worse than it is. This check exists to catch what the
 * per-client one cannot see: a combination that is impossible while every part
 * of it looks fine.
 */
export function checkEmployeeCommitments(
  snap: Snapshot,
  alreadyShortLineIds: Set<string>
): { violations: ResultViolation[]; shortfallPersonDays: number } {
  const violations: ResultViolation[] = [];
  let shortfallPersonDays = 0;

  for (const r of commitmentReport(snap)) {
    if (r.slack >= 0) continue;

    // Is every line that makes them indispensable already reported as short?
    const implicated = snap.brandProcesses.filter(
      (bp) =>
        bp.employeeIds.includes(r.employeeId) &&
        operatingDays(bp, snap).some(
          (d) => bp.employeeIds.length - 1 < minStaffOn(bp, d)
        )
    );
    if (implicated.every((bp) => alreadyShortLineIds.has(bp.id))) continue;

    const short = -r.slack;
    shortfallPersonDays += short;

    violations.push({
      date: null,
      severity: "HARD",
      kind: "EMPLOYEE_OVERCOMMITTED",
      employeeId: r.employeeId,
      message:
        `${r.name} is the only person who can cover ${r.lines.length} ` +
        `${r.lines.length === 1 ? "line of work" : "lines of work"} ` +
        `(${r.lines.join(", ")}). Between them those need somebody on duty on ` +
        `${r.indispensableDays.length} days this month, but ${r.name} can work at most ` +
        `${r.availableDays}. Short by ${short} ${short === 1 ? "day" : "days"}.`,
      suggestion:
        `Each of those clients looks adequately staffed on its own -- it is the ` +
        `combination that cannot be worked by one person. Either give one of them ` +
        `another trained resource, or move one off ${r.name}. No schedule can fix this.`,
    });
  }

  return { violations, shortfallPersonDays };
}
