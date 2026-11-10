import { test } from "node:test";
import assert from "node:assert/strict";

import {
  datesInMonth,
  datesInWeek,
  daysInMonth,
  describeCalendar,
  isOperatingDay,
  weekBucketOf,
  weekBuckets,
  weekdayOf,
} from "./calendar";
import { MASK } from "./fixtures";

// ---------------------------------------------------------------------------
// Month arithmetic
// ---------------------------------------------------------------------------

test("daysInMonth handles 31, 30 and February", () => {
  assert.equal(daysInMonth("2026-12"), 31);
  assert.equal(daysInMonth("2026-11"), 30);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2028-02"), 29, "2028 is a leap year");
});

test("datesInMonth is complete, ordered and zero-padded", () => {
  const dates = datesInMonth("2026-12");
  assert.equal(dates.length, 31);
  assert.equal(dates[0], "2026-12-01");
  assert.equal(dates.at(-1), "2026-12-31");
  assert.deepEqual([...dates].sort(), dates, "string sort must match date order");
});

// ---------------------------------------------------------------------------
// Weekday resolution — the classic timezone trap
// ---------------------------------------------------------------------------

test("weekdayOf is correct for known dates", () => {
  assert.equal(weekdayOf("2026-12-01"), 2, "1 Dec 2026 is a Tuesday");
  assert.equal(weekdayOf("2026-12-06"), 0, "6 Dec 2026 is a Sunday");
  assert.equal(weekdayOf("2026-12-25"), 5, "Christmas 2026 is a Friday");
  assert.equal(weekdayOf("2026-12-31"), 4, "31 Dec 2026 is a Thursday");
});

test("weekdayOf does not drift with the host timezone", () => {
  // The bug this guards against: constructing a local Date for a midnight
  // timestamp shifts the day backwards in negative-offset timezones.
  const original = process.env.TZ;
  const results: number[] = [];
  for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    process.env.TZ = tz;
    results.push(weekdayOf("2026-12-01"));
  }
  process.env.TZ = original;
  assert.deepEqual(new Set(results), new Set([2]), "same weekday in every timezone");
});

// ---------------------------------------------------------------------------
// Week buckets
// ---------------------------------------------------------------------------

test("week buckets group Sunday-to-Saturday and cover the month", () => {
  // December 2026 starts on a Tuesday, so the first bucket is a 5-day stub.
  assert.equal(weekBuckets("2026-12").length, 5);
  assert.deepEqual(datesInWeek("2026-12", 0), [
    "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05",
  ]);
  assert.deepEqual(datesInWeek("2026-12", 1), [
    "2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09",
    "2026-12-10", "2026-12-11", "2026-12-12",
  ]);
  // Every date lands in exactly one bucket, and nothing is lost.
  const all = weekBuckets("2026-12").flatMap((b) => datesInWeek("2026-12", b));
  assert.deepEqual(all, datesInMonth("2026-12"));
});

test("a month starting on Sunday produces full weeks", () => {
  // November 2026 starts on a Sunday.
  assert.equal(weekdayOf("2026-11-01"), 0);
  assert.equal(weekBucketOf("2026-11-01", "2026-11"), 0);
  assert.equal(weekBucketOf("2026-11-07", "2026-11"), 0);
  assert.equal(weekBucketOf("2026-11-08", "2026-11"), 1);
});

// ---------------------------------------------------------------------------
// Operating days — the three patterns from the brief, plus a custom one
// ---------------------------------------------------------------------------

const HOLIDAYS = { "2026-12-25": "Christmas Day" };

test("365-day operation works through Sundays and holidays", () => {
  const cal = { weekdayMask: MASK.ALL_DAYS, observesHolidays: false };
  assert.equal(isOperatingDay(cal, "2026-12-06", HOLIDAYS), true, "Sunday");
  assert.equal(isOperatingDay(cal, "2026-12-25", HOLIDAYS), true, "Christmas");
  const open = datesInMonth("2026-12").filter((d) => isOperatingDay(cal, d, HOLIDAYS));
  assert.equal(open.length, 31);
});

test("daily operation closed on public holidays", () => {
  const cal = { weekdayMask: MASK.ALL_DAYS, observesHolidays: true };
  assert.equal(isOperatingDay(cal, "2026-12-06", HOLIDAYS), true, "still open Sunday");
  assert.equal(isOperatingDay(cal, "2026-12-25", HOLIDAYS), false, "closed Christmas");
  const open = datesInMonth("2026-12").filter((d) => isOperatingDay(cal, d, HOLIDAYS));
  assert.equal(open.length, 30);
});

test("Sundays and public holidays off", () => {
  const cal = { weekdayMask: MASK.MON_SAT, observesHolidays: true };
  assert.equal(isOperatingDay(cal, "2026-12-06", HOLIDAYS), false, "closed Sunday");
  assert.equal(isOperatingDay(cal, "2026-12-25", HOLIDAYS), false, "closed Christmas");
  const open = datesInMonth("2026-12").filter((d) => isOperatingDay(cal, d, HOLIDAYS));
  // 31 days - 4 Sundays - 1 holiday (Christmas is a Friday, so no overlap)
  assert.equal(open.length, 26);
});

test("a fourth pattern needs no code change — weekdays, open on holidays", () => {
  const cal = { weekdayMask: MASK.WEEKDAYS, observesHolidays: false };
  assert.equal(isOperatingDay(cal, "2026-12-25", HOLIDAYS), true, "works Christmas");
  assert.equal(isOperatingDay(cal, "2026-12-05", HOLIDAYS), false, "closed Saturday");
  assert.equal(isOperatingDay(cal, "2026-12-06", HOLIDAYS), false, "closed Sunday");
});

// ---------------------------------------------------------------------------
// Human-readable descriptions
// ---------------------------------------------------------------------------

test("describeCalendar collapses contiguous runs", () => {
  assert.equal(
    describeCalendar({ weekdayMask: MASK.ALL_DAYS, observesHolidays: false }),
    "Every day, open on public holidays"
  );
  assert.equal(
    describeCalendar({ weekdayMask: MASK.MON_SAT, observesHolidays: true }),
    "Mon-Sat, closed on public holidays"
  );
  assert.equal(
    describeCalendar({ weekdayMask: MASK.WEEKDAYS, observesHolidays: true }),
    "Mon-Fri, closed on public holidays"
  );
});
