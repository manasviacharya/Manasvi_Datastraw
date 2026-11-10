import { test } from "node:test";
import assert from "node:assert/strict";

import { datesInMonth, datesInWeek, weekBucketOf, weekBuckets, weekdayOf } from "./calendar";
import { generateRoster } from "./engine";
import { emp, line, MASK, snapshot } from "./fixtures";
import type { Result, Snapshot } from "./types";

const MONTH = "2026-12";
const XMAS = { "2026-12-25": "Christmas Day" };

/** Every full week must contain at least one non-working day. */
function assertWeeklyOffForEveryone(snap: Snapshot, res: Result) {
  const stateOf = new Map(res.days.map((d) => [`${d.employeeId}|${d.date}`, d.state]));
  for (const e of snap.employees) {
    for (const bucket of weekBuckets(snap.month)) {
      const week = datesInWeek(snap.month, bucket);
      if (week.length < 3) continue;
      const hasOff = week.some((d) => stateOf.get(`${e.id}|${d}`) !== "WORKING");
      assert.ok(hasOff, `${e.id} has no day off in week starting ${week[0]}`);
    }
  }
}

function coverOn(res: Result, employeeIds: string[], date: string): number {
  return res.days.filter(
    (d) => d.date === date && employeeIds.includes(d.employeeId) && d.state === "WORKING"
  ).length;
}

// ---------------------------------------------------------------------------
// The weekly off is a hard rule
// ---------------------------------------------------------------------------

test("everyone gets a weekly off in every full week", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b"), emp("c")],
    brandProcesses: [line("l1", ["a", "b", "c"], { minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1] })],
    holidays: XMAS,
  });
  assertWeeklyOffForEveryone(snap, generateRoster(snap));
});

test("a weekly off is never traded away to cover a client", () => {
  // One person, cover demanded every single day. The engine must still give
  // them a day off and report the gap, rather than working them 31 days.
  const snap = snapshot({
    employees: [emp("solo")],
    brandProcesses: [
      line("l1", ["solo"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  assertWeeklyOffForEveryone(snap, res);
  const working = res.days.filter((d) => d.state === "WORKING").length;
  assert.ok(working <= 26, `worked ${working} days, must be at most 26`);
  assert.equal(
    res.violations.some((v) => v.kind === "NO_WEEKLY_OFF"),
    false,
    "should not report a missing weekly off — it gave them one"
  );
});

// ---------------------------------------------------------------------------
// Approved leave is immovable
// ---------------------------------------------------------------------------

test("approved leave is never scheduled over", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    ],
    leaves: [
      { employeeId: "a", date: "2026-12-10", type: "PLANNED" },
      { employeeId: "a", date: "2026-12-11", type: "SICK" },
      { employeeId: "b", date: "2026-12-22", type: "COMP_OFF" },
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  const get = (id: string, date: string) =>
    res.days.find((d) => d.employeeId === id && d.date === date)!;

  assert.equal(get("a", "2026-12-10").state, "LEAVE");
  assert.equal(get("a", "2026-12-11").state, "LEAVE");
  assert.equal(get("b", "2026-12-22").state, "COMP_OFF");
  for (const cell of [get("a", "2026-12-10"), get("b", "2026-12-22")]) {
    assert.ok(cell.isLocked, "leave must be locked");
    assert.match(cell.reason, /cannot be moved/i);
  }
});

// ---------------------------------------------------------------------------
// PLANTED CASE 1 — impossible to staff
// ---------------------------------------------------------------------------

test("one person on a 365-day line is reported as unstaffable, not just under-covered", () => {
  const snap = snapshot({
    employees: [emp("solo", { name: "Faisal Khan" })],
    brandProcesses: [
      line("vir", ["solo"], {
        brandName: "Vireo Living",
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  const shortfall = res.violations.find((v) => v.kind === "STAFFING_SHORTFALL");
  assert.ok(shortfall, "must report a staffing shortfall");
  assert.equal(shortfall!.severity, "HARD");
  assert.equal(shortfall!.date, null, "a shortfall is about the month, not one day");
  assert.match(shortfall!.message, /cannot be staffed/i);
  assert.match(shortfall!.message, /person-days/);
  assert.match(shortfall!.suggestion!, /No schedule can fix this/i);
  assert.ok(res.scorecard.shortfallPersonDays > 0);
});

test("a feasible line produces no shortfall at all", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  assert.equal(res.violations.filter((v) => v.kind === "STAFFING_SHORTFALL").length, 0);
  assert.equal(res.scorecard.shortfallPersonDays, 0);
});

// ---------------------------------------------------------------------------
// PLANTED CASE 2 — fixable by moving a day off
// ---------------------------------------------------------------------------

test("two people on a 365-day line stay covered every day", () => {
  const snap = snapshot({
    employees: [
      emp("a", { preferredWeeklyOff: 0 }),
      emp("b", { preferredWeeklyOff: 0 }), // both want Sunday — real contention
    ],
    brandProcesses: [
      line("hrl", ["a", "b"], {
        brandName: "Harlow & Co",
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  for (const date of datesInMonth(MONTH)) {
    assert.ok(
      coverOn(res, ["a", "b"], date) >= 1,
      `nobody on duty on ${date}`
    );
  }
  assert.equal(res.violations.filter((v) => v.kind === "COVERAGE_GAP").length, 0);
  assert.equal(res.scorecard.coveragePct, 100);
  assertWeeklyOffForEveryone(snap, res);
});

test("coverage survives one of two people taking leave", () => {
  const snap = snapshot({
    employees: [emp("a", { preferredWeeklyOff: 0 }), emp("b", { preferredWeeklyOff: 0 })],
    brandProcesses: [
      line("hrl", ["a", "b"], {
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    leaves: [{ employeeId: "b", date: "2026-12-08", type: "PLANNED" }],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  assert.ok(coverOn(res, ["a", "b"], "2026-12-08") >= 1, "the other person must cover");
  assert.equal(res.violations.filter((v) => v.kind === "COVERAGE_GAP").length, 0);
});

// ---------------------------------------------------------------------------
// PLANTED CASE 3 — nothing breaks
// ---------------------------------------------------------------------------

test("three people with a minimum of two absorb one person's leave", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b"), emp("c")],
    brandProcesses: [
      line("nws", ["a", "b", "c"], {
        brandName: "Northwind Supply",
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: true,
        minStaffByWeekday: [2, 2, 2, 2, 2, 2, 2],
      }),
    ],
    leaves: [{ employeeId: "c", date: "2026-12-15", type: "PLANNED" }],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  assert.ok(
    coverOn(res, ["a", "b", "c"], "2026-12-15") >= 2,
    "the remaining two must still meet the minimum"
  );
  assert.equal(
    res.violations.filter((v) => v.kind === "COVERAGE_GAP").length,
    0,
    "must not cry wolf — nothing actually broke"
  );
});

// ---------------------------------------------------------------------------
// PLANTED CASE 4 — two calendars under one client
// ---------------------------------------------------------------------------

test("one brand can run two different calendars", () => {
  const snap = snapshot({
    employees: [emp("a", { preferredWeeklyOff: 6 }), emp("b", { preferredWeeklyOff: 0 })],
    brandProcesses: [
      line("cas-cs", ["a", "b"], {
        brandId: "cas", brandName: "Castellan Leather", processCode: "CS",
        weekdayMask: MASK.ALL_DAYS, observesHolidays: false, minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
      line("cas-acc", ["a"], {
        brandId: "cas", brandName: "Castellan Leather",
        processId: "proc-acc", processCode: "ACC", processName: "Abandoned Cart",
        weekdayMask: MASK.WEEKDAYS, observesHolidays: true, minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  // Support must be covered on a Sunday and on Christmas.
  assert.ok(coverOn(res, ["a", "b"], "2026-12-06") >= 1, "CS uncovered on a Sunday");
  assert.ok(coverOn(res, ["a", "b"], "2026-12-25") >= 1, "CS uncovered on Christmas");
  // Cart recovery is closed those days, so no gap should be reported for it.
  const accGaps = res.violations.filter(
    (v) => v.kind === "COVERAGE_GAP" && v.brandProcessId === "cas-acc"
  );
  assert.equal(accGaps.length, 0, "ACC should not be expected to run weekends or holidays");
});

// ---------------------------------------------------------------------------
// Hard beats soft
// ---------------------------------------------------------------------------

test("a client's required cover outranks a preferred day off", () => {
  // One person, Mon-Sat cover, prefers Wednesday off. Wednesday is a trading
  // day, so wherever a closed Sunday is available the preference must yield
  // to it rather than leaving the client uncovered.
  const snap = snapshot({
    employees: [emp("solo", { preferredWeeklyOff: 3 })],
    brandProcesses: [
      line("l1", ["solo"], { weekdayMask: MASK.MON_SAT, observesHolidays: true }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  const offs = res.days.filter((d) => d.state === "WEEKLY_OFF");
  assert.ok(offs.length > 0);

  for (const off of offs) {
    const week = datesInWeek(MONTH, weekBucketOf(off.date, MONTH));
    const sundayAvailable = week.some((d) => weekdayOf(d) === 0);
    if (sundayAvailable) {
      assert.equal(
        weekdayOf(off.date), 0,
        `week of ${week[0]} had a closed Sunday available but took day ${weekdayOf(off.date)}`
      );
      assert.match(off.reason, /not possible because/i, "must name the client that forced it");
    }
  }

  assert.ok(
    res.violations.some((v) => v.kind === "PREFERENCE_OVERRIDDEN" && v.severity === "SOFT"),
    "the override must be reported as a soft finding"
  );
});

test("in a partial week with no closed day, the gap is unavoidable and is reported", () => {
  // December 2026 opens on a Tuesday, so its first week (1st-5th) contains no
  // Sunday. A single person covering Mon-Sat must take one trading day off,
  // whichever it is. The engine should then tie-break to the person's
  // preference, and report the resulting gap rather than hiding it.
  const snap = snapshot({
    employees: [emp("solo", { preferredWeeklyOff: 3 })],
    brandProcesses: [
      line("l1", ["solo"], { weekdayMask: MASK.MON_SAT, observesHolidays: true }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  const firstWeek = datesInWeek(MONTH, 0);
  assert.equal(firstWeek.some((d) => weekdayOf(d) === 0), false, "week 0 has no Sunday");

  const offInWeek0 = res.days.find(
    (d) => firstWeek.includes(d.date) && d.state === "WEEKLY_OFF"
  );

  // The contract here is NOT which day gets picked -- every option costs the
  // same in coverage terms, so the choice falls to the soft tiebreaks. What
  // must hold is that the off is still granted, the resulting gap is reported
  // honestly, and the soft limits are respected while doing it.
  assert.ok(offInWeek0, "a weekly off is still owed even when it breaks cover");

  const gap = res.violations.find(
    (v) => v.kind === "COVERAGE_GAP" && v.date === offInWeek0!.date
  );
  assert.ok(gap, "the unavoidable gap must be reported, not silently accepted");
  assert.equal(gap!.severity, "HARD");
  assert.ok(res.scorecard.coveragePct < 100, "and must show in the coverage score");

  // The long-run term should have steered the choice to a day that keeps the
  // working run inside the employee's limit.
  const sorted = res.days
    .filter((d) => d.employeeId === "solo")
    .sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  let longest = 0;
  for (const d of sorted) {
    if (d.state === "WORKING") { run++; longest = Math.max(longest, run); }
    else run = 0;
  }
  assert.ok(longest <= 6, `longest working run was ${longest}, limit is 6`);
  assert.equal(
    res.violations.filter((v) => v.kind === "CONSECUTIVE_DAYS").length, 0,
    "picking the day well should avoid a consecutive-days warning entirely"
  );
});

// ---------------------------------------------------------------------------
// Explainability
// ---------------------------------------------------------------------------

test("every box carries a non-empty reason", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b"), emp("c")],
    brandProcesses: [
      line("l1", ["a", "b"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
      line("l2", ["c"], { weekdayMask: MASK.WEEKDAYS }),
    ],
    leaves: [{ employeeId: "a", date: "2026-12-10", type: "PLANNED" }],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  for (const day of res.days) {
    assert.ok(
      day.reason && day.reason.trim().length > 3,
      `empty reason on ${day.employeeId} ${day.date}`
    );
    assert.doesNotMatch(day.reason, /tentative/, "internal marker leaked into output");
  }
});

test("an overridden preference explains which client caused it", () => {
  const snap = snapshot({
    employees: [emp("a", { preferredWeeklyOff: 0 }), emp("b", { preferredWeeklyOff: 0 })],
    brandProcesses: [
      line("hrl", ["a", "b"], {
        brandName: "Harlow & Co",
        weekdayMask: MASK.ALL_DAYS, observesHolidays: false, minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  // One of the two cannot have Sunday off, and the reason should say so.
  const moved = res.days.filter(
    (d) => d.state === "WEEKLY_OFF" && weekdayOf(d.date) !== 0
  );
  assert.ok(moved.length > 0, "someone must lose their Sunday");
  assert.ok(
    moved.some((d) => /Harlow/.test(d.reason) || /nobody on duty/i.test(d.reason) ||
      /spread days off/i.test(d.reason)),
    `reason should explain the override, got: ${moved[0].reason}`
  );
});

// ---------------------------------------------------------------------------
// Determinism and manual edits
// ---------------------------------------------------------------------------

test("the same input always produces the same output", () => {
  const build = () =>
    snapshot({
      employees: [
        emp("a", { preferredWeeklyOff: 0 }),
        emp("b", { preferredWeeklyOff: 0 }),
        emp("c", { preferredWeeklyOff: 6 }),
        emp("d", { preferredWeeklyOff: 2 }),
      ],
      brandProcesses: [
        line("l1", ["a", "b"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
        line("l2", ["b", "c"], { minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1] }),
        line("l3", ["c", "d"], { weekdayMask: MASK.WEEKDAYS }),
        line("l4", ["a", "c", "d"], { minStaffByWeekday: [2, 2, 2, 2, 2, 2, 2] }),
      ],
      leaves: [
        { employeeId: "a", date: "2026-12-10", type: "PLANNED" },
        { employeeId: "d", date: "2026-12-21", type: "COMP_OFF" },
      ],
      holidays: XMAS,
    });

  const first = generateRoster(build());
  for (let i = 0; i < 3; i++) {
    const again = generateRoster(build());
    assert.deepEqual(again.days, first.days, "grid differed between runs");
    assert.deepEqual(again.violations, first.violations, "violations differed between runs");
    assert.deepEqual(again.scorecard, first.scorecard, "scorecard differed between runs");
  }
});

test("a manager's manual edit survives regeneration", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    ],
    locks: [
      {
        employeeId: "a",
        date: "2026-12-16",
        state: "WEEKLY_OFF",
        reason: "Agreed with Arjun in person.",
      },
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  const cell = res.days.find((d) => d.employeeId === "a" && d.date === "2026-12-16")!;
  assert.equal(cell.state, "WEEKLY_OFF");
  assert.equal(cell.isLocked, true);
  assert.equal(cell.reason, "Agreed with Arjun in person.");
});

// ---------------------------------------------------------------------------
// Repair terminates
// ---------------------------------------------------------------------------

test("the repair pass always terminates and stays within its budget", () => {
  // Deliberately contended: eight people, ten lines of work, everyone wants
  // Sunday off, several lines need two on duty every day.
  const employees = Array.from({ length: 8 }, (_, i) =>
    emp(`e${i}`, { preferredWeeklyOff: 0 })
  );
  const lines = Array.from({ length: 10 }, (_, i) =>
    line(`l${i}`, [`e${i % 8}`, `e${(i + 1) % 8}`, `e${(i + 2) % 8}`], {
      weekdayMask: MASK.ALL_DAYS,
      observesHolidays: false,
      minStaffByWeekday: [2, 2, 2, 2, 2, 2, 2],
    })
  );
  const snap = snapshot({ employees, brandProcesses: lines, holidays: XMAS });

  const started = Date.now();
  const res = generateRoster(snap);
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 10_000, `took ${elapsed}ms, should be well under 10s`);
  assert.ok(res.stats.repairAttempts <= 2000, "must respect the attempt budget");
  assert.ok(res.stats.gapsAfter <= res.stats.gapsBefore, "repair must not make things worse");
  assertWeeklyOffForEveryone(snap, res);
});

// ---------------------------------------------------------------------------
// Scorecard sanity
// ---------------------------------------------------------------------------

test("scorecard numbers are in range and coverage reflects reality", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b"), emp("c")],
    brandProcesses: [
      line("l1", ["a", "b"], { minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1] }),
      line("l2", ["c"], { weekdayMask: MASK.WEEKDAYS }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  const s = res.scorecard;

  for (const [name, value] of [
    ["coveragePct", s.coveragePct],
    ["preferenceMetPct", s.preferenceMetPct],
  ] as const) {
    assert.ok(value >= 0 && value <= 100, `${name} out of range: ${value}`);
  }
  assert.ok(s.fairnessSpread >= 0);
  assert.equal(s.coveragePct, 100, "this configuration is comfortably staffable");
  assert.equal(
    res.violations.filter((v) => v.severity === "HARD").length,
    0,
    "no hard violations expected here"
  );
});

test("coverage percentage drops when a gap genuinely exists", () => {
  const snap = snapshot({
    employees: [emp("solo")],
    brandProcesses: [
      line("l1", ["solo"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  assert.ok(res.scorecard.coveragePct < 100, "a real gap must show in the score");
  assert.ok(
    res.violations.some((v) => v.kind === "COVERAGE_GAP"),
    "and must be itemised day by day"
  );
});

// ---------------------------------------------------------------------------
// One person, too many clients
//
// The mirror image of a staffing shortfall, and the brief's "employee being
// assigned to overlapping responsibilities". Each client passes a per-client
// capacity check while the combination is impossible for one person.
// ---------------------------------------------------------------------------

test("an over-committed employee is reported, not blamed for taking a day off", () => {
  // Mon-Sat at one client, Sundays at another. Each is fine alone; together
  // they need all seven days from one person.
  const snap = snapshot({
    employees: [emp("solo", { name: "Pooja Bhatt" })],
    brandProcesses: [
      line("a", ["solo"], { brandName: "Client A", weekdayMask: MASK.MON_SAT }),
      line("b", ["solo"], {
        brandName: "Client B",
        weekdayMask: [true, false, false, false, false, false, false],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  const found = res.violations.find((v) => v.kind === "EMPLOYEE_OVERCOMMITTED");
  assert.ok(found, "the over-commitment must be reported");
  assert.equal(found!.severity, "HARD");
  assert.equal(found!.date, null, "it is a fact about the month, not one day");
  assert.equal(found!.employeeId, "solo");
  assert.match(found!.message, /Pooja Bhatt/);
  assert.match(found!.message, /Client A/);
  assert.match(found!.message, /Client B/);
  assert.match(found!.suggestion!, /combination/i);
  assert.match(found!.suggestion!, /No schedule can fix this/i);

  assert.ok(
    res.scorecard.shortfallPersonDays > 0,
    "impossible work must show in the shortfall figure, not read as zero"
  );
});

test("a dispensable employee is never reported as over-committed", () => {
  // Same two clients, but each has a second person. Neither is indispensable,
  // so neither is over-committed however many clients they touch.
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("x", ["a", "b"], { brandName: "Client X", weekdayMask: MASK.MON_SAT }),
      line("y", ["a", "b"], {
        brandName: "Client Y",
        weekdayMask: [true, false, false, false, false, false, false],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);
  assert.equal(
    res.violations.filter((v) => v.kind === "EMPLOYEE_OVERCOMMITTED").length,
    0,
    "backup cover makes nobody indispensable"
  );
});

test("the same problem is not reported twice at two levels", () => {
  // One person, one client, 365 days. That is already a per-client staffing
  // shortfall. Reporting it again as over-commitment would double-count it and
  // make the problem list look worse than it is.
  const snap = snapshot({
    employees: [emp("solo")],
    brandProcesses: [
      line("vir", ["solo"], { weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  assert.equal(res.violations.filter((v) => v.kind === "STAFFING_SHORTFALL").length, 1);
  assert.equal(
    res.violations.filter((v) => v.kind === "EMPLOYEE_OVERCOMMITTED").length,
    0,
    "suppressed because the per-client check already said it"
  );
});

// ---------------------------------------------------------------------------
// Minimum staffing that varies by weekday
//
// The brief asks for "minimum staffing requirements on specific days". A
// single figure per service cannot express "three on Mondays, two otherwise",
// so the minimum is stored as a per-weekday array alongside the calendar.
// ---------------------------------------------------------------------------

test("a weekday with a higher minimum is staffed to that higher number", () => {
  // Three people. Two needed most days, three on Mondays.
  const snap = snapshot({
    employees: [emp("a"), emp("b"), emp("c")],
    brandProcesses: [
      line("nws", ["a", "b", "c"], {
        brandName: "Northwind Supply",
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: true,
        minStaffByWeekday: [2, 3, 2, 2, 2, 2, 2],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  for (const date of datesInMonth(MONTH)) {
    if (date === "2026-12-25") continue; // closed
    const need = weekdayOf(date) === 1 ? 3 : 2;
    assert.ok(
      coverOn(res, ["a", "b", "c"], date) >= need,
      `${date} (weekday ${weekdayOf(date)}) needs ${need}, had ${coverOn(res, ["a", "b", "c"], date)}`
    );
  }
  assert.equal(res.violations.filter((v) => v.kind === "COVERAGE_GAP").length, 0);
  assert.equal(res.scorecard.coveragePct, 100);
});

test("nobody takes a Monday off when Mondays need everyone", () => {
  // Exactly three people and a Monday minimum of three, so every Monday is
  // all-hands and the weekly off has to land elsewhere.
  const snap = snapshot({
    employees: [
      emp("a", { preferredWeeklyOff: 1 }), // all three would *prefer* Monday
      emp("b", { preferredWeeklyOff: 1 }),
      emp("c", { preferredWeeklyOff: 1 }),
    ],
    brandProcesses: [
      line("l1", ["a", "b", "c"], {
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 3, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: {},
  });
  const res = generateRoster(snap);

  const mondayOffs = res.days.filter(
    (d) => weekdayOf(d.date) === 1 && d.state !== "WORKING"
  );
  assert.equal(
    mondayOffs.length, 0,
    "a client needing all three on Mondays must outrank all three preferring Monday off"
  );
  assert.ok(
    res.violations.some((v) => v.kind === "PREFERENCE_OVERRIDDEN"),
    "and the overridden preference must be reported, not hidden"
  );
});

test("the per-day minimum is reflected in the feasibility arithmetic", () => {
  // One person, open Mon-Fri, but needing two people every day. 22 operating
  // days x 2 = 44 person-days against one person's ~26. Multiplying by a
  // single figure and summing per day agree here, but summing is what makes
  // a varying minimum countable at all.
  const snap = snapshot({
    employees: [emp("solo")],
    brandProcesses: [
      line("l1", ["solo"], {
        weekdayMask: MASK.WEEKDAYS,
        minStaffByWeekday: [2, 2, 2, 2, 2, 2, 2],
      }),
    ],
    holidays: XMAS,
  });
  const res = generateRoster(snap);

  const shortfall = res.violations.find((v) => v.kind === "STAFFING_SHORTFALL");
  assert.ok(shortfall, "two people needed and one assigned is unstaffable");
  assert.match(shortfall!.message, /person-days/);
  assert.ok(res.scorecard.shortfallPersonDays > 0);
});
