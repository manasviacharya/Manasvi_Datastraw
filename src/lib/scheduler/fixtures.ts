/**
 * Fixture builders for tests.
 *
 * These let the engine be tested with no database at all, which is the whole
 * point of keeping it a pure function over a Snapshot.
 */

import type { Snapshot, SnapBrandProcess, SnapEmployee } from "./types";

const T = true;
const F = false;

export const MASK = {
  ALL_DAYS: [T, T, T, T, T, T, T],
  MON_SAT: [F, T, T, T, T, T, T],
  WEEKDAYS: [F, T, T, T, T, T, F],
};

export function emp(
  id: string,
  overrides: Partial<SnapEmployee> = {}
): SnapEmployee {
  return {
    id,
    code: id,
    name: `Employee ${id}`,
    podId: "pod1",
    podName: "Pod One",
    isPodLead: false,
    preferredWeeklyOff: 0,
    maxConsecutiveDays: 6,
    ...overrides,
  };
}

export function line(
  id: string,
  employeeIds: string[],
  overrides: Partial<SnapBrandProcess> = {}
): SnapBrandProcess {
  return {
    id,
    brandId: `brand-${id}`,
    brandName: `Brand ${id}`,
    brandCode: id.toUpperCase(),
    processId: "proc-cs",
    processName: "Customer Support",
    processCode: "CS",
    weekdayMask: MASK.MON_SAT,
    observesHolidays: true,
    minStaffByWeekday: [1, 1, 1, 1, 1, 1, 1],
    employeeIds,
    ownerIds: employeeIds.slice(0, 1),
    ...overrides,
  };
}

export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    month: "2026-12",
    employees: [],
    brandProcesses: [],
    leaves: [],
    holidays: {},
    locks: [],
    ...overrides,
  };
}
