/**
 * The bridge between the database and the scheduling engine.
 *
 * The engine knows nothing about Prisma. This module reads a month's worth of
 * state into a plain Snapshot, runs the engine, and writes the result back.
 * Keeping the translation in one place is what lets the engine stay pure and
 * testable.
 */

import { db } from "./db";
import { normaliseMinStaff } from "./scheduler/calendar";
import { generateRoster } from "./scheduler/engine";
import { capacityReport } from "./scheduler/feasibility";
import type { Result, Snapshot, SnapBrandProcess } from "./scheduler/types";

/** The month the sample data is built around. */
export const DEFAULT_MONTH = "2026-12";

/** Months offered in the picker: a year either side of the sample month. */
export function selectableMonths(): string[] {
  const out: string[] = [];
  const [y, m] = DEFAULT_MONTH.split("-").map(Number);
  for (let offset = -3; offset <= 6; offset++) {
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading state out of the database
// ---------------------------------------------------------------------------

/**
 * Gather everything the engine needs for one month.
 *
 * Manual edits (locked boxes) from an existing roster are carried in as locks,
 * so regenerating respects decisions a manager already made by hand.
 */
export async function buildSnapshot(month: string): Promise<Snapshot> {
  const [employees, brandProcesses, leaves, holidays, existing] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      include: { pod: true },
      orderBy: { code: "asc" },
    }),
    db.brandProcess.findMany({
      where: { active: true, brand: { active: true } },
      include: {
        brand: true,
        process: true,
        assignments: { include: { employee: true } },
      },
      orderBy: [{ brand: { name: "asc" } }, { process: { code: "asc" } }],
    }),
    db.leave.findMany({
      where: { status: "APPROVED", date: { startsWith: month } },
    }),
    db.holiday.findMany({ where: { date: { startsWith: month } } }),
    db.roster.findUnique({
      where: { month },
      include: { days: { where: { isLocked: true } } },
    }),
  ]);

  const snapBrandProcesses: SnapBrandProcess[] = brandProcesses.map((bp) => ({
    id: bp.id,
    brandId: bp.brandId,
    brandName: bp.brand.name,
    brandCode: bp.brand.code,
    processId: bp.processId,
    processName: bp.process.name,
    processCode: bp.process.code,
    weekdayMask: bp.weekdayMask,
    observesHolidays: bp.observesHolidays,
    // Normalised here so the engine can index the array without defending
    // itself on every read. A row written by hand, or before this column
    // existed, would otherwise yield undefined minimums.
    minStaffByWeekday: normaliseMinStaff(bp.minStaffByWeekday),
    employeeIds: bp.assignments.map((a) => a.employeeId),
    ownerIds: bp.assignments.filter((a) => a.isPrimary).map((a) => a.employeeId),
    notes: bp.notes,
  }));

  return {
    month,
    employees: employees.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      podId: e.podId,
      podName: e.pod.name,
      isPodLead: e.isPodLead,
      preferredWeeklyOff: e.preferredWeeklyOff,
      maxConsecutiveDays: e.maxConsecutiveDays,
    })),
    brandProcesses: snapBrandProcesses,
    leaves: leaves.map((l) => ({
      employeeId: l.employeeId,
      date: l.date,
      type: l.type,
    })),
    holidays: Object.fromEntries(holidays.map((h) => [h.date, h.name])),
    // Leave already arrives as a hard constraint, so only genuine manual edits
    // need carrying across as locks.
    locks: (existing?.days ?? [])
      .filter((d) => d.state === "WEEKLY_OFF" || d.state === "WORKING")
      .map((d) => ({
        employeeId: d.employeeId,
        date: d.date,
        state: d.state,
        reason: d.reason,
      })),
  };
}

// ---------------------------------------------------------------------------
// Writing the result back
// ---------------------------------------------------------------------------

/**
 * Generate a roster for a month and save it, replacing any existing draft.
 *
 * The whole write is one transaction: a half-written roster, where the grid
 * has been replaced but the problem list still describes the old one, would be
 * worse than no roster at all.
 */
export async function generateAndSave(month: string): Promise<{
  rosterId: string;
  result: Result;
}> {
  const snap = await buildSnapshot(month);
  const result = generateRoster(snap);

  const rosterId = await db.$transaction(async (tx) => {
    const roster = await tx.roster.upsert({
      where: { month },
      update: {
        status: "DRAFT",
        generatedAt: new Date(),
        publishedAt: null,
        coveragePct: result.scorecard.coveragePct,
        preferenceMetPct: result.scorecard.preferenceMetPct,
        fairnessSpread: result.scorecard.fairnessSpread,
        shortfallPersonDays: result.scorecard.shortfallPersonDays,
      },
      create: {
        month,
        status: "DRAFT",
        coveragePct: result.scorecard.coveragePct,
        preferenceMetPct: result.scorecard.preferenceMetPct,
        fairnessSpread: result.scorecard.fairnessSpread,
        shortfallPersonDays: result.scorecard.shortfallPersonDays,
      },
    });

    await tx.rosterDay.deleteMany({ where: { rosterId: roster.id } });
    await tx.violation.deleteMany({ where: { rosterId: roster.id } });

    await tx.rosterDay.createMany({
      data: result.days.map((d) => ({
        rosterId: roster.id,
        employeeId: d.employeeId,
        date: d.date,
        state: d.state,
        reason: d.reason,
        isLocked: d.isLocked,
      })),
    });

    await tx.violation.createMany({
      data: result.violations.map((v) => ({
        rosterId: roster.id,
        date: v.date,
        severity: v.severity,
        kind: v.kind,
        brandProcessId: v.brandProcessId ?? null,
        employeeId: v.employeeId ?? null,
        message: v.message,
        suggestion: v.suggestion ?? null,
        suggestedEmployeeId: v.suggestedEmployeeId ?? null,
      })),
    });

    return roster.id;
  }, { timeout: 30_000 });

  return { rosterId, result };
}

/** Publish a roster. Refuses while any must-fix problem remains. */
export async function publishRoster(month: string): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const roster = await db.roster.findUnique({
    where: { month },
    include: { violations: { where: { severity: "HARD" } } },
  });

  if (!roster) return { ok: false, reason: "No roster has been generated for this month yet." };
  if (roster.violations.length > 0) {
    return {
      ok: false,
      reason:
        `${roster.violations.length} must-fix ${roster.violations.length === 1 ? "problem" : "problems"} ` +
        `still need attention. Publishing a roster with uncovered client days would hide them.`,
    };
  }

  await db.roster.update({
    where: { month },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reading a saved roster back for the views
// ---------------------------------------------------------------------------

export async function getRoster(month: string) {
  return db.roster.findUnique({
    where: { month },
    include: {
      days: { orderBy: [{ employeeId: "asc" }, { date: "asc" }] },
      violations: { orderBy: [{ severity: "asc" }, { date: "asc" }] },
    },
  });
}

export async function getRosterSummary(month: string) {
  const roster = await db.roster.findUnique({
    where: { month },
    include: {
      _count: { select: { days: true, violations: true } },
      violations: { select: { severity: true, kind: true } },
    },
  });
  if (!roster) return null;

  const hard = roster.violations.filter((v) => v.severity === "HARD").length;
  return {
    id: roster.id,
    month: roster.month,
    status: roster.status,
    generatedAt: roster.generatedAt,
    publishedAt: roster.publishedAt,
    scorecard: {
      coveragePct: roster.coveragePct,
      preferenceMetPct: roster.preferenceMetPct,
      fairnessSpread: roster.fairnessSpread,
      shortfallPersonDays: roster.shortfallPersonDays,
    },
    hardCount: hard,
    softCount: roster.violations.length - hard,
    canPublish: hard === 0,
  };
}

/** Capacity analysis for a month, without generating anything. */
export async function getCapacityReport(month: string) {
  const snap = await buildSnapshot(month);
  return { snapshot: snap, reports: capacityReport(snap) };
}
