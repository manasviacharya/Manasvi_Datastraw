"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { generateAndSave } from "@/lib/roster-service";
import { BRANDS } from "../../../prisma/seed-data";

/**
 * Admin mutations.
 *
 * These are what make the brief's "no code changes" requirement true: a
 * manager can add a brand, change a calendar, move an assignment or edit the
 * holiday list without anyone touching the repository.
 */

function refresh() {
  for (const p of ["/", "/brands", "/processes", "/employees", "/pods", "/conflicts", "/admin"]) {
    revalidatePath(p);
  }
  revalidatePath("/admin/lines");
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/assignments");
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/leave");
  revalidatePath("/roster/brand/[id]", "page");
}

/** Parse the seven weekday checkboxes into a mask. Index 0 = Sunday. */
function readWeekdayMask(formData: FormData): boolean[] {
  return Array.from({ length: 7 }, (_, i) => formData.get(`day${i}`) === "on");
}

/**
 * Parse the seven per-weekday minimums. Index 0 = Sunday.
 *
 * Validated against the mask, because a client that is open on a day with a
 * minimum of zero is a contradiction: it would read as fully covered while
 * nobody serves it. Closed days keep whatever value is submitted, since it is
 * never consulted, but default to 1 so toggling a day open later does not
 * silently produce a zero minimum.
 */
function readMinStaff(formData: FormData, mask: boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const raw = formData.get(`min${i}`);
    const n = raw === null || raw === "" ? 1 : Number(raw);

    if (!Number.isInteger(n) || n < 1 || n > 20) {
      const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (mask[i]) {
        throw new Error(
          `The minimum for ${DAY[i]} must be a whole number between 1 and 20, not "${raw}".`
        );
      }
      out.push(1);
      continue;
    }
    out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lines of work — the calendar lives here
// ---------------------------------------------------------------------------

export async function saveLineAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const mask = readWeekdayMask(formData);

  if (!mask.some(Boolean)) {
    throw new Error("A service must be open on at least one day of the week.");
  }
  const minStaff = readMinStaff(formData, mask);

  await db.brandProcess.update({
    where: { id },
    data: {
      weekdayMask: mask,
      observesHolidays: formData.get("observesHolidays") === "on",
      minStaffByWeekday: minStaff,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });

  refresh();
  redirect("/admin/lines?saved=1");
}

export async function createLineAction(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const processId = String(formData.get("processId") ?? "");
  const mask = readWeekdayMask(formData);

  if (!brandId || !processId) throw new Error("Pick both a brand and a kind of work.");
  if (!mask.some(Boolean)) throw new Error("Pick at least one operating day.");

  const existing = await db.brandProcess.findUnique({
    where: { brandId_processId: { brandId, processId } },
  });
  if (existing) {
    throw new Error("That brand already has this kind of work. Edit the existing row instead.");
  }

  await db.brandProcess.create({
    data: {
      brandId,
      processId,
      weekdayMask: mask,
      observesHolidays: formData.get("observesHolidays") === "on",
      minStaffByWeekday: readMinStaff(formData, mask),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });

  refresh();
  redirect("/admin/lines?created=1");
}

export async function deleteLineAction(formData: FormData) {
  await db.brandProcess.delete({ where: { id: String(formData.get("id") ?? "") } });
  refresh();
  redirect("/admin/lines?deleted=1");
}

// ---------------------------------------------------------------------------
// Assignments — who can cover what
// ---------------------------------------------------------------------------

export async function createAssignmentAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const brandProcessId = String(formData.get("brandProcessId") ?? "");
  const isPrimary = formData.get("isPrimary") === "on";

  if (!employeeId || !brandProcessId) throw new Error("Pick both a person and a line of work.");

  await db.assignment.upsert({
    where: { employeeId_brandProcessId: { employeeId, brandProcessId } },
    update: { isPrimary },
    create: { employeeId, brandProcessId, isPrimary },
  });

  refresh();
  redirect("/admin/assignments?saved=1");
}

export async function deleteAssignmentAction(formData: FormData) {
  await db.assignment.delete({ where: { id: String(formData.get("id") ?? "") } });
  refresh();
  redirect("/admin/assignments?deleted=1");
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export async function createHolidayAction(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Expected a date like 2026-12-25, received "${date}"`);
  }
  if (!name) throw new Error("Give the holiday a name.");

  await db.holiday.upsert({
    where: { date },
    update: { name },
    create: { date, name },
  });

  refresh();
  redirect("/admin/holidays?saved=1");
}

export async function deleteHolidayAction(formData: FormData) {
  await db.holiday.delete({ where: { id: String(formData.get("id") ?? "") } });
  refresh();
  redirect("/admin/holidays?deleted=1");
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function saveEmployeeAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const preferred = Number(formData.get("preferredWeeklyOff") ?? 0);
  const maxConsecutive = Number(formData.get("maxConsecutiveDays") ?? 6);

  if (preferred < 0 || preferred > 6) throw new Error("Preferred day off must be a weekday.");
  if (maxConsecutive < 1 || maxConsecutive > 14) {
    throw new Error("Maximum consecutive days must be between 1 and 14.");
  }

  await db.employee.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim(),
      preferredWeeklyOff: preferred,
      maxConsecutiveDays: maxConsecutive,
      active: formData.get("active") === "on",
    },
  });

  refresh();
  redirect("/admin/people?saved=1");
}

// ---------------------------------------------------------------------------
// Brands and kinds of work
// ---------------------------------------------------------------------------

export async function createBrandAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const ownerPodId = String(formData.get("ownerPodId") ?? "") || null;

  if (!name || !code) throw new Error("A client needs both a name and a short code.");
  if (code.length > 8) throw new Error("Keep the short code to 8 characters or fewer.");

  // Both columns are unique, so check before inserting to give a readable
  // error instead of a Prisma constraint violation.
  const clash = await db.brand.findFirst({ where: { OR: [{ name }, { code }] } });
  if (clash) {
    throw new Error(
      clash.name === name
        ? `There is already a client called "${name}".`
        : `The short code "${code}" is already used by ${clash.name}.`
    );
  }

  await db.brand.create({ data: { name, code, ownerPodId } });
  refresh();
  redirect("/admin/catalog?created=client");
}

export async function createProcessAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();

  if (!name || !code) throw new Error("A service needs both a name and a short code.");
  if (code.length > 8) throw new Error("Keep the short code to 8 characters or fewer.");

  const clash = await db.process.findFirst({ where: { OR: [{ name }, { code }] } });
  if (clash) {
    throw new Error(
      clash.name === name
        ? `There is already a service called "${name}".`
        : `The short code "${code}" is already used by ${clash.name}.`
    );
  }

  await db.process.create({
    data: { name, code, description: String(formData.get("description") ?? "").trim() || null },
  });
  refresh();
  redirect("/admin/catalog?created=service");
}

/**
 * Save a line of work whose fields came from the plain-English parser.
 *
 * Identical to createLineAction except that it records the original sentence
 * as the note, so the wording a manager typed stays visible next to the
 * settings it produced. Importantly the values written here come from the
 * SUBMITTED FORM, not from the parser's output directly -- whatever the
 * manager corrected on screen is what gets saved.
 */
export async function createLineFromRuleAction(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const processId = String(formData.get("processId") ?? "");
  const mask = readWeekdayMask(formData);
  const rule = String(formData.get("notes") ?? "").trim();

  if (!brandId || !processId) throw new Error("Pick both a brand and a kind of work.");
  if (!mask.some(Boolean)) throw new Error("A line of work must be open on at least one day.");

  const note = rule ? `From the rule: "${rule}"` : null;

  // The plain-English parser produces a single figure, so it is applied to
  // every weekday. A manager who needs it to vary edits the row afterwards --
  // teaching the parser "three on Mondays" is a separate piece of work, and
  // noted as a limitation rather than silently approximated.
  const minStaff = readMinStaff(formData, mask);

  await db.brandProcess.upsert({
    where: { brandId_processId: { brandId, processId } },
    update: {
      weekdayMask: mask,
      observesHolidays: formData.get("observesHolidays") === "on",
      minStaffByWeekday: minStaff,
      notes: note,
    },
    create: {
      brandId,
      processId,
      weekdayMask: mask,
      observesHolidays: formData.get("observesHolidays") === "on",
      minStaffByWeekday: minStaff,
      notes: note,
    },
  });

  refresh();
  redirect("/admin/lines?created=1");
}

/**
 * Create a team.
 *
 * Completes the brief's optional item about adding brands, pods and processes
 * dynamically. Teams have no required fields beyond a name, because a lead is
 * assigned by editing an employee rather than by creating the team.
 */
export async function createPodAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Give the team a name.");

  const existing = await db.pod.findUnique({ where: { name } });
  if (existing) throw new Error(`There is already a team called "${name}".`);

  await db.pod.create({ data: { name } });
  refresh();
  redirect("/admin/catalog?created=team");
}

/**
 * Delete a client, and everything hanging off it.
 *
 * Added because the catalog page could create clients but not remove them, so
 * a brand made while trying the form stayed forever -- and an empty one
 * quietly skewed the single-resource percentage the brief asks about.
 *
 * Refuses once a client has services, because deleting those cascades to
 * assignments and silently changes the roster. Clear the services first, so
 * the consequence is visible rather than implied by a single click.
 */
export async function deleteBrandAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const brand = await db.brand.findUnique({
    where: { id },
    include: { _count: { select: { brandProcesses: true } } },
  });
  if (!brand) throw new Error("That client no longer exists.");

  if (brand._count.brandProcesses > 0) {
    throw new Error(
      `${brand.name} still buys ${brand._count.brandProcesses} ` +
        `${brand._count.brandProcesses === 1 ? "service" : "services"}. ` +
        `Remove those first — deleting them also removes who was assigned to them.`
    );
  }

  await db.brand.delete({ where: { id } });
  refresh();
  redirect("/admin/catalog?deleted=client");
}

/**
 * Delete a service from the catalogue.
 *
 * Refuses while any client still buys it, for the same reason deleting a
 * client with services is refused: the cascade would remove those clients'
 * calendars and everyone assigned to them, changing the roster as a side
 * effect of a single click. Remove it from each client first, so the
 * consequence is something you chose rather than something you discovered.
 */
export async function deleteProcessAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const proc = await db.process.findUnique({
    where: { id },
    include: { _count: { select: { brandProcesses: true } } },
  });
  if (!proc) throw new Error("That service no longer exists.");

  if (proc._count.brandProcesses > 0) {
    throw new Error(
      `${proc.name} is still bought by ${proc._count.brandProcesses} ` +
        `${proc._count.brandProcesses === 1 ? "client" : "clients"}. ` +
        `Remove it from them first — deleting it would also remove everyone assigned to it.`
    );
  }

  await db.process.delete({ where: { id } });
  refresh();
  redirect("/admin/catalog?deleted=service");
}

/**
 * Delete a team.
 *
 * Refuses while anyone is still in it, because employees require a team and
 * the delete would fail at the database level anyway. Better a sentence that
 * says what to do than a constraint violation.
 */
export async function deletePodAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const pod = await db.pod.findUnique({
    where: { id },
    include: { _count: { select: { employees: true, brands: true } } },
  });
  if (!pod) throw new Error("That team no longer exists.");

  if (pod._count.employees > 0) {
    throw new Error(
      `${pod.name} still has ${pod._count.employees} ` +
        `${pod._count.employees === 1 ? "person" : "people"} in it. ` +
        `Move them to another team first.`
    );
  }
  if (pod._count.brands > 0) {
    throw new Error(
      `${pod.name} still owns ${pod._count.brands} ` +
        `${pod._count.brands === 1 ? "client" : "clients"}. ` +
        `Reassign them to another team first.`
    );
  }

  await db.pod.delete({ where: { id } });
  refresh();
  redirect("/admin/catalog?deleted=team");
}

/**
 * Reset demo data so the 5 planted cases exist in their clean initial state.
 *
 * Removes any temporary backup assigned to Vireo Living during testing,
 * removes any unseeded test brands, clears previous locks, and regenerates
 * a pristine 2026-12 roster so it can be demonstrated immediately.
 */
export async function resetPlantedCasesAction() {
  const virBrand = await db.brand.findUnique({
    where: { code: "VIR" },
    include: { brandProcesses: true },
  });

  if (virBrand) {
    const e04 = await db.employee.findUnique({ where: { code: "E04" } });
    if (e04) {
      for (const bp of virBrand.brandProcesses) {
        await db.assignment.deleteMany({
          where: {
            brandProcessId: bp.id,
            employeeId: { not: e04.id },
          },
        });
      }
    }
  }

  const seededBrandCodes = BRANDS.map((b) => b.code);
  await db.brand.deleteMany({
    where: { code: { notIn: seededBrandCodes } },
  });

  await db.roster.deleteMany({
    where: { month: "2026-12" },
  });

  await generateAndSave("2026-12");

  refresh();
  redirect("/conflicts?month=2026-12&reset=1");
}
