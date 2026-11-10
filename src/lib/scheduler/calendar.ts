/**
 * Date and calendar helpers.
 *
 * Every date in this application is a plain "YYYY-MM-DD" string, never a Date
 * object. Date objects carry a timezone, and a roster generated at 00:30 IST
 * would silently shift by a day when rendered on a UTC server. Strings compare
 * and sort correctly by default and cannot drift.
 *
 * The one place a Date is used is working out which weekday a date falls on,
 * and there it is constructed in UTC and discarded immediately.
 */

import type { SnapBrandProcess, Snapshot } from "./types";

/** "2026-12" -> 12 */
export function monthNumber(month: string): number {
  return Number(month.slice(5, 7));
}

/** "2026-12" -> 2026 */
export function yearNumber(month: string): number {
  return Number(month.slice(0, 4));
}

/** Days in the given "YYYY-MM". */
export function daysInMonth(month: string): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(yearNumber(month), monthNumber(month), 0)).getUTCDate();
}

/** Every date in the month, in order, as "YYYY-MM-DD". */
export function datesInMonth(month: string): string[] {
  const n = daysInMonth(month);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Which calendar week a date belongs to, as an integer that increases through
 * the month. Weeks start on Sunday, matching the weekday indices used in
 * weekdayMask and preferredWeeklyOff.
 *
 * A month's first and last weeks are usually partial. They still count as
 * weeks, because the right to a weekly off does not disappear just because a
 * week straddles a month boundary. The alternative -- ignoring partial weeks --
 * would let the engine schedule someone 10 days straight across a month end.
 */
export function weekBucketOf(date: string, month: string): number {
  const dayOfMonth = Number(date.slice(8, 10));
  const firstWeekday = weekdayOf(`${month}-01`);
  return Math.floor((dayOfMonth - 1 + firstWeekday) / 7);
}

/** All week buckets the month touches, in order. */
export function weekBuckets(month: string): number[] {
  const last = weekBucketOf(datesInMonth(month).at(-1)!, month);
  return Array.from({ length: last + 1 }, (_, i) => i);
}

/** Dates of the month that fall inside one week bucket. */
export function datesInWeek(month: string, bucket: number): string[] {
  return datesInMonth(month).filter((d) => weekBucketOf(d, month) === bucket);
}

/**
 * Does this line of work expect coverage on this date?
 *
 * Two inputs decide it: the weekday mask, and whether the client observes
 * public holidays. That pair expresses all three patterns named in the brief
 * plus anything else a manager invents, with no code change.
 */
export function isOperatingDay(
  bp: Pick<SnapBrandProcess, "weekdayMask" | "observesHolidays">,
  date: string,
  holidays: Record<string, string>
): boolean {
  if (!bp.weekdayMask[weekdayOf(date)]) return false;
  if (bp.observesHolidays && holidays[date]) return false;
  return true;
}

/** Operating days for one line of work across the month. */
export function operatingDays(
  bp: SnapBrandProcess,
  snap: Snapshot
): string[] {
  return datesInMonth(snap.month).filter((d) =>
    isOperatingDay(bp, d, snap.holidays)
  );
}

/**
 * Minimum people required on this date.
 *
 * Index 0 = Sunday. Values for days the client is closed are never consulted,
 * because callers check isOperatingDay first.
 *
 * The clamp to at least 1 is defensive, not a feature: the admin form and the
 * seed both always write seven positive values, and buildSnapshot normalises
 * anything that is not. If a malformed row somehow reaches here, treating an
 * open day as needing nobody would silently report full coverage for a client
 * nobody is serving, which is the worst possible failure for this app.
 */
export function minStaffOn(
  bp: { minStaffByWeekday: number[] },
  date: string
): number {
  const n = bp.minStaffByWeekday[weekdayOf(date)];
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Ensure exactly seven positive integers, whatever arrives. */
export function normaliseMinStaff(input: readonly number[] | null | undefined): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const n = input?.[i];
    out.push(Number.isFinite(n) && (n as number) >= 1 ? Math.floor(n as number) : 1);
  }
  return out;
}

/** "2 every day", "3 on Mon, 2 otherwise", "1-3 depending on the day". */
export function describeMinStaff(
  bp: { weekdayMask: boolean[]; minStaffByWeekday: number[] }
): string {
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Only days the client is actually open say anything about staffing.
  const open = bp.weekdayMask
    .map((isOpen, i) => (isOpen ? i : -1))
    .filter((i) => i >= 0);
  if (open.length === 0) return "closed";

  const values = open.map((i) => bp.minStaffByWeekday[i] ?? 1);
  const unique = [...new Set(values)];
  if (unique.length === 1) {
    return `${unique[0]} ${unique[0] === 1 ? "person" : "people"} every open day`;
  }

  // Describe the exceptions against whichever value is most common.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const base = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const exceptions = open
    .filter((i) => (bp.minStaffByWeekday[i] ?? 1) !== base)
    .map((i) => `${bp.minStaffByWeekday[i]} on ${SHORT[i]}`);

  return `${base} most days, ${exceptions.join(", ")}`;
}

/** A readable description of a calendar, for the UI and for AI prompts. */
export function describeCalendar(
  bp: Pick<SnapBrandProcess, "weekdayMask" | "observesHolidays">
): string {
  const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const open = bp.weekdayMask.map((v, i) => (v ? NAMES[i] : null)).filter(Boolean) as string[];

  let days: string;
  if (open.length === 7) days = "Every day";
  else if (open.length === 0) days = "Never";
  else {
    // Collapse a contiguous run into "Mon-Sat" rather than listing seven names.
    const idx = bp.weekdayMask.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    days = contiguous && idx.length > 2
      ? `${NAMES[idx[0]]}-${NAMES[idx.at(-1)!]}`
      : open.join(", ");
  }

  return bp.observesHolidays
    ? `${days}, closed on public holidays`
    : `${days}, open on public holidays`;
}

/** "2026-12-25" -> "Fri 25 Dec" */
export function formatShort(date: string): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const d = Number(date.slice(8, 10));
  const m = Number(date.slice(5, 7)) - 1;
  return `${DAYS[weekdayOf(date)]} ${d} ${MONTHS[m]}`;
}

/** "2026-12" -> "December 2026" */
export function formatMonth(month: string): string {
  const MONTHS = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return `${MONTHS[monthNumber(month) - 1]} ${yearNumber(month)}`;
}
