/**
 * Direct tests for pass 4, the repair step.
 *
 * Pass 4 almost never fires through the normal entry point, because pass 3
 * already avoids gaps as it assigns. That is good for roster quality but bad
 * for test coverage: a safety net nobody has tested is not a safety net. So
 * these tests build a deliberately bad grid by hand -- the kind of mistake a
 * greedy pass could in principle make -- and check that repair notices and
 * fixes it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { __testing } from "./engine";
import { emp, line, MASK, snapshot } from "./fixtures";
import type { Snapshot } from "./types";

const { buildDemand, pinImmovables, repair, findGaps, totalGapCount, setCell, getCell } =
  __testing;

const XMAS = { "2026-12-25": "Christmas Day" };

/** Build the grid up to the end of pass 2, with no off-days placed yet. */
function gridAfterPass2(snap: Snapshot) {
  const grid = new Map<string, Map<string, { state: never; reason: string; isLocked: boolean }>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pinImmovables(snap, grid as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return grid as any;
}

test("repair moves a badly placed day off and closes the gap", () => {
  // Two people cover a line that runs every day and needs one on duty.
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], {
        brandName: "Harlow & Co",
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });

  const demand = buildDemand(snap);
  const grid = gridAfterPass2(snap);

  // Deliberately put BOTH people off on the same day. This is the mistake a
  // greedy pass is theoretically capable of, and it leaves the client with
  // nobody on duty.
  const badDate = "2026-12-16"; // a Wednesday, mid-week, room to move either side
  for (const id of ["a", "b"]) {
    setCell(grid, id, badDate, {
      state: "WEEKLY_OFF",
      reason: "deliberately bad placement",
      isLocked: false,
    });
  }

  const before = totalGapCount(snap, grid, demand);
  assert.equal(before, 1, "the bad grid should have exactly one uncovered day");

  const { applied } = repair(snap, grid, demand);

  assert.ok(applied >= 1, "repair should have applied at least one move");
  assert.equal(totalGapCount(snap, grid, demand), 0, "the gap should be closed");

  // Exactly one of them should now be working that day, and the other should
  // still have an off somewhere in the same week.
  const workingThatDay = ["a", "b"].filter(
    (id) => getCell(grid, id, badDate)?.state === "WORKING"
  );
  assert.equal(workingThatDay.length, 1, "one person covers, one keeps the day off");

  const moved = workingThatDay[0];
  const offsInWeek = [
    "2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16",
    "2026-12-17", "2026-12-18", "2026-12-19",
  ].filter((d) => getCell(grid, moved, d)?.state === "WEEKLY_OFF");
  assert.equal(offsInWeek.length, 1, "their weekly off moved, it was not deleted");
  assert.notEqual(offsInWeek[0], badDate);
});

test("the moved day off records why it moved", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], {
        brandName: "Castellan Leather",
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });

  const demand = buildDemand(snap);
  const grid = gridAfterPass2(snap);
  const badDate = "2026-12-16";
  for (const id of ["a", "b"]) {
    setCell(grid, id, badDate, { state: "WEEKLY_OFF", reason: "bad", isLocked: false });
  }

  repair(snap, grid, demand);

  const worker = ["a", "b"].find((id) => getCell(grid, id, badDate)?.state === "WORKING")!;
  const cell = getCell(grid, worker, badDate)!;
  assert.match(cell.reason, /Castellan Leather/, "names the client that needed cover");
  assert.match(cell.reason, /needs 1 on duty/);
  assert.doesNotMatch(cell.reason, /bad|tentative/, "the placeholder reason was replaced");
});

test("repair refuses a move that would not help", () => {
  // One person, cover needed every day. Moving their day off cannot help --
  // wherever it lands, that day is uncovered. Repair must leave it alone
  // rather than shuffling pointlessly.
  const snap = snapshot({
    employees: [emp("solo")],
    brandProcesses: [
      line("l1", ["solo"], {
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });

  const demand = buildDemand(snap);
  const grid = gridAfterPass2(snap);
  setCell(grid, "solo", "2026-12-16", {
    state: "WEEKLY_OFF",
    reason: "weekly off",
    isLocked: false,
  });

  const before = totalGapCount(snap, grid, demand);
  const { applied } = repair(snap, grid, demand);

  assert.equal(applied, 0, "no move can help, so none should be made");
  assert.equal(totalGapCount(snap, grid, demand), before, "state unchanged");
  assert.equal(
    getCell(grid, "solo", "2026-12-16")?.state, "WEEKLY_OFF",
    "the off day stayed where it was"
  );
});

test("repair never touches a locked box", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], {
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    // Both are unavailable on the 16th, and both for immovable reasons.
    leaves: [
      { employeeId: "a", date: "2026-12-16", type: "PLANNED" },
      { employeeId: "b", date: "2026-12-16", type: "SICK" },
    ],
    holidays: XMAS,
  });

  const demand = buildDemand(snap);
  const grid = gridAfterPass2(snap);

  assert.equal(totalGapCount(snap, grid, demand), 1, "the 16th is uncovered");

  const { applied } = repair(snap, grid, demand);

  assert.equal(applied, 0, "approved leave is immovable, so nothing can be done");
  for (const id of ["a", "b"]) {
    const cell = getCell(grid, id, "2026-12-16")!;
    assert.equal(cell.isLocked, true);
    assert.match(cell.reason, /cannot be moved/i);
  }
});

test("repair closes several independent gaps in one run", () => {
  const snap = snapshot({
    employees: [emp("a"), emp("b")],
    brandProcesses: [
      line("l1", ["a", "b"], {
        weekdayMask: MASK.ALL_DAYS,
        observesHolidays: false,
        minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
      }),
    ],
    holidays: XMAS,
  });

  const demand = buildDemand(snap);
  const grid = gridAfterPass2(snap);

  // Three separate weeks, each with both people wrongly off on the same day.
  for (const badDate of ["2026-12-09", "2026-12-16", "2026-12-23"]) {
    for (const id of ["a", "b"]) {
      setCell(grid, id, badDate, { state: "WEEKLY_OFF", reason: "bad", isLocked: false });
    }
  }

  assert.equal(totalGapCount(snap, grid, demand), 3);
  const { applied } = repair(snap, grid, demand);

  assert.ok(applied >= 3, `expected at least 3 moves, got ${applied}`);
  assert.equal(findGaps(snap, grid, demand).length, 0, "all three gaps closed");
});
