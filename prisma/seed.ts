/**
 * Loads the sample dataset.
 *
 * Safe to run more than once: every write is an upsert keyed on a unique
 * business code, so a second run makes no changes. That matters because the
 * live Render database is seeded by hand from a shell, and because the whole
 * environment needs to be rebuildable with one command if the free database
 * is ever lost.
 *
 *   npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import {
  BRANDS,
  CALENDARS,
  EMPLOYEES,
  HOLIDAYS,
  LEAVES,
  PODS,
  PROCESSES,
  ownerCount,
} from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding sample data...\n");

  // --- Pods -----------------------------------------------------------------
  const podIdByName = new Map<string, string>();
  for (const pod of PODS) {
    const row = await prisma.pod.upsert({
      where: { name: pod.name },
      update: {},
      create: { name: pod.name },
    });
    podIdByName.set(pod.name, row.id);
  }
  console.log(`  pods            ${PODS.length}`);

  // --- Employees ------------------------------------------------------------
  const employeeIdByCode = new Map<string, string>();
  for (const emp of EMPLOYEES) {
    const podId = podIdByName.get(emp.pod);
    if (!podId) throw new Error(`Unknown pod "${emp.pod}" for employee ${emp.code}`);

    const row = await prisma.employee.upsert({
      where: { code: emp.code },
      update: {
        name: emp.name,
        podId,
        preferredWeeklyOff: emp.preferredWeeklyOff,
        isPodLead: emp.isPodLead ?? false,
      },
      create: {
        code: emp.code,
        name: emp.name,
        email: `${emp.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        podId,
        preferredWeeklyOff: emp.preferredWeeklyOff,
        isPodLead: emp.isPodLead ?? false,
      },
    });
    employeeIdByCode.set(emp.code, row.id);
  }
  console.log(`  employees       ${EMPLOYEES.length}`);

  // --- Pod leads ------------------------------------------------------------
  // Done as a second pass because it points from Employee back to Pod.
  for (const pod of PODS) {
    const leadId = employeeIdByCode.get(pod.leadCode);
    const podId = podIdByName.get(pod.name);
    if (!leadId || !podId) throw new Error(`Cannot link lead for pod ${pod.name}`);
    await prisma.employee.update({
      where: { id: leadId },
      data: { ledPodId: podId },
    });
  }
  console.log(`  pod leads       ${PODS.length}`);

  // --- Processes ------------------------------------------------------------
  const processIdByCode = new Map<string, string>();
  for (const proc of PROCESSES) {
    const row = await prisma.process.upsert({
      where: { code: proc.code },
      update: { name: proc.name, description: proc.description },
      create: proc,
    });
    processIdByCode.set(proc.code, row.id);
  }
  console.log(`  kinds of work   ${PROCESSES.length}`);

  // --- Brands, lines of work, and staffing ---------------------------------
  let lineCount = 0;
  let assignmentCount = 0;
  const seededAssignmentIds: string[] = [];

  for (const brand of BRANDS) {
    const ownerPodId = podIdByName.get(brand.ownerPod) ?? null;

    const brandRow = await prisma.brand.upsert({
      where: { code: brand.code },
      update: { name: brand.name, ownerPodId },
      create: { code: brand.code, name: brand.name, ownerPodId },
    });

    for (const line of brand.lines) {
      const processId = processIdByCode.get(line.process);
      if (!processId) throw new Error(`Unknown process "${line.process}" on ${brand.code}`);

      const cal = CALENDARS[line.calendar];
      // A scalar in the seed data means the same minimum every day; an
      // explicit array overrides it where a client's requirement varies.
      const minStaff =
        line.minStaffByWeekday ?? Array.from({ length: 7 }, () => line.minStaffPerDay);

      const lineRow = await prisma.brandProcess.upsert({
        where: { brandId_processId: { brandId: brandRow.id, processId } },
        update: {
          weekdayMask: cal.weekdayMask,
          observesHolidays: cal.observesHolidays,
          minStaffByWeekday: minStaff,
          notes: line.notes ?? cal.label,
        },
        create: {
          brandId: brandRow.id,
          processId,
          weekdayMask: cal.weekdayMask,
          observesHolidays: cal.observesHolidays,
          minStaffByWeekday: minStaff,
          notes: line.notes ?? cal.label,
        },
      });
      lineCount++;

      // EVERYONE in `staff` owns this work; only `backup` is stand-in cover.
      //
      // This previously marked just staff[0] as primary, which made a brand
      // with three people on it report as having ONE owner -- and dragged the
      // single-resource figure the brief cares about from 82% up to 96%. The
      // other two were being rendered as backups when they are nothing of the
      // kind. isPrimary distinguishes owner from stand-in, not first from
      // rest.
      const roster: { code: string; isPrimary: boolean }[] = [
        ...line.staff.map((code) => ({ code, isPrimary: true })),
        ...(line.backup ?? []).map((code) => ({ code, isPrimary: false })),
      ];

      for (const { code, isPrimary } of roster) {
        const employeeId = employeeIdByCode.get(code);
        if (!employeeId) throw new Error(`Unknown employee "${code}" on ${brand.code}`);

        const assignedRow = await prisma.assignment.upsert({
          where: {
            employeeId_brandProcessId: { employeeId, brandProcessId: lineRow.id },
          },
          update: { isPrimary },
          create: { employeeId, brandProcessId: lineRow.id, isPrimary },
        });
        seededAssignmentIds.push(assignedRow.id);
        assignmentCount++;
      }
    }
  }
  console.log(`  brands          ${BRANDS.length}`);
  console.log(`  lines of work   ${lineCount}`);
  console.log(`  assignments     ${assignmentCount}`);

  // --- Holidays -------------------------------------------------------------
  for (const hol of HOLIDAYS) {
    await prisma.holiday.upsert({
      where: { date: hol.date },
      update: { name: hol.name },
      create: hol,
    });
  }
  console.log(`  holidays        ${HOLIDAYS.length}`);

  // --- Leave ----------------------------------------------------------------
  for (const leave of LEAVES) {
    const employeeId = employeeIdByCode.get(leave.employee);
    if (!employeeId) throw new Error(`Unknown employee "${leave.employee}" in leave data`);

    await prisma.leave.upsert({
      where: { employeeId_date: { employeeId, date: leave.date } },
      update: { type: leave.type, reason: leave.reason, status: "APPROVED" },
      create: {
        employeeId,
        date: leave.date,
        type: leave.type,
        reason: leave.reason,
        status: "APPROVED",
      },
    });
  }
  console.log(`  leave records   ${LEAVES.length}`);

  // --- Cleanup of test data to ensure clean planted cases --------------------
  const extraneousAssignments = await prisma.assignment.deleteMany({
    where: { id: { notIn: seededAssignmentIds } },
  });
  if (extraneousAssignments.count > 0) {
    console.log(`  cleaned up      ${extraneousAssignments.count} test assignments`);
  }

  const seededBrandCodes = BRANDS.map((b) => b.code);
  const extraneousBrands = await prisma.brand.deleteMany({
    where: { code: { notIn: seededBrandCodes } },
  });
  if (extraneousBrands.count > 0) {
    console.log(`  cleaned up      ${extraneousBrands.count} test brands`);
  }

  // Reset the demo month's roster so it starts completely fresh on next view
  await prisma.roster.deleteMany({
    where: { month: "2026-12" },
  });
  console.log("  reset roster    2026-12 (ready to generate fresh)");

  // --- Summary --------------------------------------------------------------
  const singleResource = BRANDS.filter((b) => ownerCount(b) === 1).length;

  console.log("\nDone.");
  console.log(
    `  ${singleResource} of ${BRANDS.length} brands are owned by one person ` +
      `(${Math.round((singleResource / BRANDS.length) * 100)}%)`
  );
  console.log("  Pod leads are backup cover, not owners, so that figure is unaffected.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("\nSeed failed:\n", err);
    await prisma.$disconnect();
    process.exit(1);
  });
