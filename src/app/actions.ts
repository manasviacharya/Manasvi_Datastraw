"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { generateAndSave, publishRoster } from "@/lib/roster-service";

/**
 * Mutations, as server actions.
 *
 * Kept here rather than behind REST routes because every caller is a form in
 * this same app. The one genuine HTTP endpoint is /api/health, which Render
 * calls from outside.
 */

function refreshRosterViews() {
  for (const path of ["/", "/roster/company", "/conflicts", "/brands", "/pods", "/processes"]) {
    revalidatePath(path);
  }
  revalidatePath("/roster/brand/[id]", "page");
  revalidatePath("/roster/employee/[id]", "page");
}

export async function generateRosterAction(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Expected a month like 2026-12, received "${month}"`);
  }

  await generateAndSave(month);
  refreshRosterViews();
  redirect(`/roster/company?month=${month}`);
}

export async function publishRosterAction(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  const result = await publishRoster(month);
  refreshRosterViews();

  if (!result.ok) {
    redirect(`/conflicts?month=${month}&blocked=${encodeURIComponent(result.reason)}`);
  }
  redirect(`/?month=${month}&published=1`);
}

/**
 * Edit one box by hand and lock it, so regeneration will not overwrite it.
 *
 * The change is saved without re-running the engine. The manager then
 * regenerates to see its knock-on effects, which keeps "what I changed" and
 * "what that caused" as two separate, visible steps.
 */
export async function editDayAction(formData: FormData) {
  const rosterDayId = String(formData.get("rosterDayId") ?? "");
  const state = String(formData.get("state") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const month = String(formData.get("month") ?? "");

  const allowed = ["WORKING", "WEEKLY_OFF", "LEAVE", "COMP_OFF"];
  if (!allowed.includes(state)) throw new Error(`Unexpected state "${state}"`);

  const day = await db.rosterDay.findUnique({
    where: { id: rosterDayId },
    include: { employee: true },
  });
  if (!day) throw new Error("That day is no longer in the roster.");

  await db.rosterDay.update({
    where: { id: rosterDayId },
    data: {
      state: state as "WORKING" | "WEEKLY_OFF" | "LEAVE" | "COMP_OFF",
      isLocked: true,
      reason: note
        ? `Set by hand: ${note}`
        : `Set by hand by the operations manager on ${new Date().toISOString().slice(0, 10)}.`,
    },
  });

  refreshRosterViews();
  redirect(`/roster/employee/${day.employeeId}?month=${month}&edited=1`);
}

/** Release a manual edit so the engine can place that day again. */
export async function unlockDayAction(formData: FormData) {
  const rosterDayId = String(formData.get("rosterDayId") ?? "");
  const month = String(formData.get("month") ?? "");

  const day = await db.rosterDay.findUnique({ where: { id: rosterDayId } });
  if (!day) throw new Error("That day is no longer in the roster.");

  await db.rosterDay.update({
    where: { id: rosterDayId },
    data: { isLocked: false, reason: "Manual lock released. Regenerate to reschedule." },
  });

  refreshRosterViews();
  redirect(`/roster/employee/${day.employeeId}?month=${month}`);
}

/**
 * Approve a day of leave.
 *
 * Deliberately allowed even when the impact check says it leaves a client
 * uncovered. The app's job is to make the consequence visible, not to overrule
 * the manager. The resulting gap stays on the problem list until it is dealt
 * with, and publishing stays blocked while it is there.
 */
export async function approveLeaveAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const date = String(formData.get("date") ?? "");
  const month = String(formData.get("month") ?? date.slice(0, 7));
  const type = String(formData.get("type") ?? "PLANNED");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Expected a date like 2026-12-10, received "${date}"`);
  }
  if (!["PLANNED", "COMP_OFF", "SICK"].includes(type)) {
    throw new Error(`Unexpected leave type "${type}"`);
  }

  await db.leave.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: { type: type as "PLANNED" | "COMP_OFF" | "SICK", status: "APPROVED" },
    create: {
      employeeId,
      date,
      type: type as "PLANNED" | "COMP_OFF" | "SICK",
      status: "APPROVED",
      reason: "Approved after reviewing the impact.",
    },
  });

  refreshRosterViews();
  revalidatePath("/leave");
  redirect(`/leave?month=${month}&approved=1`);
}

/** Withdraw an approved leave day. */
export async function deleteLeaveAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  await db.leave.delete({ where: { id } });
  refreshRosterViews();
  revalidatePath("/admin/leave");
  redirect(`/admin/leave?month=${month}`);
}

/**
 * Act on a suggested fix.
 *
 * The conflict list already names somebody who could close a gap. Until now
 * that was prose: a manager had to read the name, go to the assignments
 * screen and retype it. This does it directly.
 *
 * Two deliberate limits.
 *
 * The person is added as BACKUP cover, not as an owner. They are being pulled
 * in to close one gap, which is not the same as taking the account on, and
 * the single-resource figure the brief cares about counts owners.
 *
 * It rebuilds the month afterwards. Assigning somebody changes nothing until
 * the schedule is regenerated, and leaving the problem list stale after an
 * apparently successful action is worse than the extra ten seconds. The
 * before and after problem counts come back with the redirect so the effect
 * is visible rather than assumed.
 */
export async function applySuggestionAction(formData: FormData) {
  const violationId = String(formData.get("violationId") ?? "");
  const month = String(formData.get("month") ?? "");

  const violation = await db.violation.findUnique({
    where: { id: violationId },
    include: { brandProcess: { include: { brand: true, process: true } } },
  });
  if (!violation) throw new Error("That problem is no longer in the list.");
  if (!violation.suggestedEmployeeId || !violation.brandProcessId) {
    throw new Error("This problem has no single action to apply.");
  }

  const employee = await db.employee.findUnique({
    where: { id: violation.suggestedEmployeeId },
  });
  if (!employee) throw new Error("The suggested person no longer exists.");

  const before = await db.violation.count({
    where: { roster: { month }, severity: "HARD" },
  });

  await db.assignment.upsert({
    where: {
      employeeId_brandProcessId: {
        employeeId: employee.id,
        brandProcessId: violation.brandProcessId,
      },
    },
    update: {},
    create: {
      employeeId: employee.id,
      brandProcessId: violation.brandProcessId,
      isPrimary: false,
    },
  });

  await generateAndSave(month);

  const after = await db.violation.count({
    where: { roster: { month }, severity: "HARD" },
  });

  refreshRosterViews();
  const label = violation.brandProcess
    ? `${violation.brandProcess.brand.name} / ${violation.brandProcess.process.code}`
    : "that client";

  redirect(
    `/conflicts?month=${month}&applied=${encodeURIComponent(
      `${employee.name} can now cover ${label}. Must-fix problems: ${before} → ${after}.`
    )}`
  );
}
