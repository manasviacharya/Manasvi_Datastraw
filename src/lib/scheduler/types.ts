/**
 * Types for the scheduling engine.
 *
 * The engine is deliberately free of any database import. It takes a plain
 * Snapshot object in and returns a plain Result object out, which means:
 *   - it can be tested with fixture data and no database at all
 *   - the same input always produces the same output
 *   - the API routes stay thin
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type DayState = "WORKING" | "WEEKLY_OFF" | "HOLIDAY" | "LEAVE" | "COMP_OFF";
export type LeaveType = "PLANNED" | "COMP_OFF" | "SICK";
export type Severity = "HARD" | "SOFT";

export type ViolationKind =
  | "STAFFING_SHORTFALL"
  | "EMPLOYEE_OVERCOMMITTED"
  | "COVERAGE_GAP"
  /** Reserved, never emitted. See the note in schema.prisma. */
  | "DOUBLE_BOOKED"
  | "NO_WEEKLY_OFF"
  | "PREFERENCE_OVERRIDDEN"
  | "CONSECUTIVE_DAYS";

export type SnapEmployee = {
  id: string;
  code: string;
  name: string;
  podId: string;
  podName: string;
  isPodLead: boolean;
  /** 0 = Sunday ... 6 = Saturday. A preference, not a rule. */
  preferredWeeklyOff: number;
  maxConsecutiveDays: number;
};

export type SnapBrandProcess = {
  id: string;
  brandId: string;
  brandName: string;
  brandCode: string;
  processId: string;
  processName: string;
  processCode: string;
  /** Seven booleans, index 0 = Sunday. True means the client expects cover. */
  weekdayMask: boolean[];
  observesHolidays: boolean;
  /** Minimum people per weekday, index 0 = Sunday. Always 7 entries. */
  minStaffByWeekday: number[];
  /** Employee ids able to cover this line of work. */
  employeeIds: string[];
  /** Subset of employeeIds who own it day to day, as opposed to backing it up. */
  ownerIds: string[];
  notes?: string | null;
};

export type SnapLeave = {
  employeeId: string;
  /** Plain YYYY-MM-DD. */
  date: string;
  type: LeaveType;
};

/** A box a manager edited by hand. The engine treats these as fixed input. */
export type SnapLock = {
  employeeId: string;
  date: string;
  state: DayState;
  reason: string;
};

export type Snapshot = {
  /** YYYY-MM. */
  month: string;
  employees: SnapEmployee[];
  brandProcesses: SnapBrandProcess[];
  leaves: SnapLeave[];
  /** Map of YYYY-MM-DD to holiday name. */
  holidays: Record<string, string>;
  locks?: SnapLock[];
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type ResultDay = {
  employeeId: string;
  date: string;
  state: DayState;
  /**
   * Why this box ended up in this state, written at the moment of the
   * decision. This is what makes the roster explainable, and what lets the
   * AI layer summarise rather than guess.
   */
  reason: string;
  isLocked: boolean;
};

export type ResultViolation = {
  /** Null when the problem is about the whole month rather than one day. */
  date: string | null;
  severity: Severity;
  kind: ViolationKind;
  brandProcessId?: string;
  employeeId?: string;
  message: string;
  suggestion?: string;
  /** Set when the suggestion names somebody and the fix is one action. */
  suggestedEmployeeId?: string;
};

export type Scorecard = {
  /** Satisfied brand-process-days as a percentage of required ones. */
  coveragePct: number;
  /** Share of employee-weeks where the preferred weekly off was kept. */
  preferenceMetPct: number;
  /** Standard deviation of Sunday-offs across the team. Lower is fairer. */
  fairnessSpread: number;
  /** Person-days of demand that no assigned person could possibly supply. */
  shortfallPersonDays: number;
};

export type Result = {
  month: string;
  days: ResultDay[];
  violations: ResultViolation[];
  scorecard: Scorecard;
  /** Diagnostics, handy in tests and when explaining a run. */
  stats: {
    datesInMonth: number;
    weekBuckets: number;
    repairAttempts: number;
    repairsApplied: number;
    gapsBefore: number;
    gapsAfter: number;
  };
};
