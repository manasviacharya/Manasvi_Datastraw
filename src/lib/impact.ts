/**
 * Impact analysis for a change to a published roster.
 *
 * The brief asks the app to handle at least one change after a roster exists.
 * Rather than scripting one scenario, this computes the general case.
 *
 * The method is a diff, not a guess:
 *   1. Re-run the engine with the requested day forced off.
 *   2. Compare the new problem list against the current one.
 *   3. Anything new is what this change would break.
 *   4. For each new gap, search for a backup in widening rings.
 *
 * Nothing is saved. The manager sees what would happen and then decides,
 * which keeps "what I changed" and "what that caused" separate and visible.
 */

import { db } from "./db";
import { buildSnapshot } from "./roster-service";
import { generateRoster } from "./scheduler/engine";
import { rankBackups } from "./scheduler/backups";
import { isOperatingDay, minStaffOn } from "./scheduler/calendar";
import type { ResultViolation, Snapshot } from "./scheduler/types";

export type BackupOption = {
  employeeId: string;
  name: string;
  podName: string;
  /** Why this person is a plausible stand-in. */
  rationale: string;
  /** Nearer rings are better. 1 = already on this line of work. */
  ring: 1 | 2 | 3;
};

export type ImpactReport = {
  employeeId: string;
  employeeName: string;
  date: string;
  /** Problems that exist now, before the change. */
  currentHardCount: number;
  /** Problems that would exist after it. */
  projectedHardCount: number;
  /**
   * New problems that involve this person or a client they cover. These are
   * what approving the request actually causes.
   */
  newViolations: ResultViolation[];
  /**
   * New problems involving OTHER people.
   *
   * Approving re-runs the whole month, and the engine re-optimises globally:
   * one person being off changes how crowded each day is, which shifts other
   * people's days off. Those shifts are real, but they are reshuffling rather
   * than damage, and they are largely offset by existing warnings that
   * disappear at the same time. Listing them beside the actual consequence
   * buried it -- on one request, 7 of 9 "new" problems were unrelated people
   * swapping days, against 9 that vanished.
   */
  knockOnViolations: ResultViolation[];
  /** Problems that would go away. Rare, but worth showing honestly. */
  resolvedViolations: ResultViolation[];
  /** Lines of work this person covers that operate on this date. */
  affectedLines: {
    brandProcessId: string;
    label: string;
    minStaff: number;
    coverWithout: number;
    stillCovered: boolean;
    backups: BackupOption[];
  }[];
  /** The headline: can this be approved without breaking anything? */
  verdict: "SAFE" | "COVERED_BY_BACKUP" | "BREAKS_COVER";
  summary: string;
};

/** A stable key so the same problem can be recognised across two runs. */
function violationKey(v: ResultViolation): string {
  return [v.kind, v.date ?? "", v.brandProcessId ?? "", v.employeeId ?? ""].join("|");
}

/**
 * Who could stand in, ranked.
 *
 * Delegates to the shared ranker so this screen and the problem list cannot
 * disagree about who the best candidate is. `includeAlreadyAssigned` is on
 * here because the question is "can the others absorb this absence", which
 * colleagues already on the line of work can answer.
 */
function findBackups(
  snap: Snapshot,
  brandProcessId: string,
  date: string,
  excludeEmployeeId: string,
  workingOn: Set<string>
): BackupOption[] {
  const bp = snap.brandProcesses.find((b) => b.id === brandProcessId);
  if (!bp) return [];

  return rankBackups(snap, bp, date, (id) => workingOn.has(id), {
    exclude: [excludeEmployeeId],
    includeAlreadyAssigned: true,
  })
    .slice(0, 5)
    .map((c) => ({
      employeeId: c.employeeId,
      name: c.name,
      podName: c.podName,
      rationale: c.rationale,
      ring: c.ring,
    }));
}

/**
 * What would happen if this person were unavailable on this date?
 */
export async function analyseLeaveImpact(
  employeeId: string,
  date: string
): Promise<ImpactReport> {
  const month = date.slice(0, 7);

  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error("No such employee.");

  const snap = await buildSnapshot(month);

  // Baseline: the month as it stands today.
  const before = generateRoster(snap);

  // Projected: the same month with this date forced off.
  const projectedSnap: Snapshot = {
    ...snap,
    leaves: [
      ...snap.leaves.filter((l) => !(l.employeeId === employeeId && l.date === date)),
      { employeeId, date, type: "PLANNED" as const },
    ],
  };
  const after = generateRoster(projectedSnap);

  const beforeKeys = new Set(before.violations.map(violationKey));
  const afterKeys = new Set(after.violations.map(violationKey));

  const allNew = after.violations.filter((v) => !beforeKeys.has(violationKey(v)));
  const resolvedViolations = before.violations.filter((v) => !afterKeys.has(violationKey(v)));

  // Which client-services does this person touch? Used to tell a consequence
  // of the request apart from the engine re-optimising around it.
  const ownLineIds = new Set(
    snap.brandProcesses.filter((bp) => bp.employeeIds.includes(employeeId)).map((bp) => bp.id)
  );
  const isAboutThisRequest = (v: ResultViolation) =>
    v.employeeId === employeeId || (v.brandProcessId != null && ownLineIds.has(v.brandProcessId));

  const newViolations = allNew.filter(isAboutThisRequest);
  const knockOnViolations = allNew.filter((v) => !isAboutThisRequest(v));

  // Who else would be working that day, under the projected roster?
  const workingOn = new Set(
    after.days.filter((d) => d.date === date && d.state === "WORKING").map((d) => d.employeeId)
  );
  workingOn.delete(employeeId);

  // Which of this person's lines of work actually operate that day?
  const affectedLines = snap.brandProcesses
    .filter((bp) => bp.employeeIds.includes(employeeId))
    .filter((bp) => isOperatingDay(bp, date, snap.holidays))
    .map((bp) => {
      const coverWithout = bp.employeeIds.filter((id) => workingOn.has(id)).length;
      const needed = minStaffOn(bp, date);
      const stillCovered = coverWithout >= needed;
      return {
        brandProcessId: bp.id,
        label: `${bp.brandName} / ${bp.processCode}`,
        minStaff: needed,
        coverWithout,
        stillCovered,
        backups: stillCovered
          ? []
          : findBackups(snap, bp.id, date, employeeId, workingOn),
      };
    });

  const broken = affectedLines.filter((l) => !l.stillCovered);
  const newHard = newViolations.filter((v) => v.severity === "HARD");

  let verdict: ImpactReport["verdict"];
  let summary: string;

  if (broken.length === 0 && newHard.length === 0) {
    verdict = "SAFE";
    summary =
      affectedLines.length === 0
        ? `Nothing ${employee.name} covers operates on this date. Approving costs nothing.`
        : `All ${affectedLines.length} ${affectedLines.length === 1 ? "line" : "lines"} of work ` +
          `${employee.name} covers still meet their minimum without them. Approve it — nothing breaks.`;
  } else if (broken.every((l) => l.backups.length > 0)) {
    verdict = "COVERED_BY_BACKUP";
    const names = [...new Set(broken.map((l) => l.backups[0].name))].join(", ");
    summary =
      `${broken.length} ${broken.length === 1 ? "line" : "lines"} of work would lose cover, ` +
      `but a stand-in is available for each (${names}). Approve with a swap.`;
  } else {
    verdict = "BREAKS_COVER";
    const orphans = broken.filter((l) => l.backups.length === 0);
    summary =
      `${orphans.length} ${orphans.length === 1 ? "line" : "lines"} of work ` +
      `(${orphans.map((l) => l.label).join(", ")}) would have nobody on duty, and nobody else ` +
      `is trained on it. Approving leaves the client uncovered.`;
  }

  return {
    employeeId,
    employeeName: employee.name,
    date,
    currentHardCount: before.violations.filter((v) => v.severity === "HARD").length,
    projectedHardCount: after.violations.filter((v) => v.severity === "HARD").length,
    newViolations,
    knockOnViolations,
    resolvedViolations,
    affectedLines,
    verdict,
    summary,
  };
}
