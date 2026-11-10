/**
 * Finding somebody to cover a gap.
 *
 * One implementation, used by both the problem list and the leave impact
 * check. They previously had their own: the problem list searched two rings
 * and took the first array element, the impact check searched three and
 * returned five. Two screens answering the same question differently is a bug
 * waiting to be noticed by whoever reads both.
 *
 * ELIGIBILITY is a lookup, not a judgement. A person qualifies when they are
 * not already on this line of work, they are working that day, and they are
 * either trained on the same service elsewhere or sit in the same team as an
 * owner. Deliberately not a similarity search -- whether somebody can cover a
 * service is a fact in the assignment table, and making a correct lookup
 * fuzzy would be a downgrade.
 *
 * RANKING is where the old code was weak. It took whichever candidate the
 * database happened to return first. On the sample data that meant offering
 * somebody already covering two services for Vireo Living while eight people
 * covering one were passed over. Harmless when the suggestion was only prose;
 * not harmless now that a button acts on it.
 */

import type { SnapBrandProcess, SnapEmployee, Snapshot } from "./types";

export type BackupRing = 1 | 2 | 3;

export type BackupCandidate = {
  employeeId: string;
  name: string;
  podName: string;
  ring: BackupRing;
  /** How many lines of work this person already covers. Lower is better. */
  currentLoad: number;
  /** In the same team as somebody who owns this line of work. */
  samePod: boolean;
  /** Why they qualify, in words, for the UI. */
  rationale: string;
};

/**
 * Rank candidates to cover `bp` on `date`.
 *
 * Order of preference:
 *   1. Ring. Already on this work beats trained elsewhere beats same team.
 *      Qualification outranks everything -- a trained stranger is a better
 *      answer than an untrained colleague.
 *   2. Current load, lowest first. Spreading work is not only fairer, it is
 *      the thing that keeps somebody from becoming over-committed across
 *      clients, which is a hard failure the feasibility check reports.
 *   3. Same team as an owner. Continuity, once the first two are equal.
 *   4. Name. Only so the result is stable between runs.
 */
export function rankBackups(
  snap: Snapshot,
  bp: SnapBrandProcess,
  date: string,
  isWorking: (employeeId: string, date: string) => boolean,
  opts: { exclude?: string[]; includeAlreadyAssigned?: boolean } = {}
): BackupCandidate[] {
  const empById = new Map(snap.employees.map((e) => [e.id, e]));
  const excluded = new Set(opts.exclude ?? []);

  // How many lines of work each person already covers. Computed once.
  const load = new Map<string, number>();
  for (const line of snap.brandProcesses) {
    for (const id of line.employeeIds) load.set(id, (load.get(id) ?? 0) + 1);
  }

  const ownerPods = new Set(
    bp.employeeIds.map((id) => empById.get(id)?.podId).filter(Boolean) as string[]
  );

  const seen = new Map<string, BackupCandidate>();

  const consider = (emp: SnapEmployee, ring: BackupRing, rationale: string) => {
    if (excluded.has(emp.id)) return;
    if (!isWorking(emp.id, date)) return;
    // Keep the best ring if somebody qualifies more than one way.
    const existing = seen.get(emp.id);
    if (existing && existing.ring <= ring) return;
    seen.set(emp.id, {
      employeeId: emp.id,
      name: emp.name,
      podName: emp.podName,
      ring,
      currentLoad: load.get(emp.id) ?? 0,
      samePod: ownerPods.has(emp.podId),
      rationale,
    });
  };

  // Ring 1 — already assigned to this exact line of work.
  // Only meaningful for the impact check, where the question is "can the
  // others absorb this absence". The problem list excludes them, because
  // somebody already assigned is not a fix for a gap.
  if (opts.includeAlreadyAssigned) {
    for (const id of bp.employeeIds) {
      const e = empById.get(id);
      if (e) {
        consider(e, 1, `Already assigned to ${bp.brandName} ${bp.processCode}, and on duty that day.`);
      }
    }
  }

  // Ring 2 — trained on the same service at another client.
  for (const other of snap.brandProcesses) {
    if (other.id === bp.id || other.processId !== bp.processId) continue;
    for (const id of other.employeeIds) {
      if (bp.employeeIds.includes(id)) continue;
      const e = empById.get(id);
      if (e) {
        consider(e, 2, `Already works ${bp.processName} for ${other.brandName}, and is on duty that day.`);
      }
    }
  }

  // Ring 3 — same team as an owner, but not trained on this service.
  for (const e of snap.employees) {
    if (bp.employeeIds.includes(e.id)) continue;
    if (!ownerPods.has(e.podId)) continue;
    consider(e, 3, `In the ${e.podName} team alongside the usual owner, and on duty that day.`);
  }

  return [...seen.values()].sort(
    (a, b) =>
      a.ring - b.ring ||
      a.currentLoad - b.currentLoad ||
      Number(b.samePod) - Number(a.samePod) ||
      a.name.localeCompare(b.name)
  );
}

/** A sentence explaining why this person was picked ahead of the others. */
export function describeChoice(c: BackupCandidate, totalCandidates: number): string {
  const others = totalCandidates - 1;
  const loadNote =
    c.currentLoad === 0
      ? "and covers nothing else"
      : `and already covers ${c.currentLoad} other ${c.currentLoad === 1 ? "line" : "lines"} of work`;

  return (
    `${c.rationale} They ${loadNote}, which is why they are suggested ahead of ` +
    `${others === 0 ? "nobody else" : `the other ${others} who also qualify`}.`
  );
}
