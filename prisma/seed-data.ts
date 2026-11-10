// ---------------------------------------------------------------------------
// Sample dataset.
//
// Shaped to match the brief:
//   - 32 employees (26 operational staff + 6 pod leads)
//   - 6 pods
//   - 22 brands, of which 18 are covered by a single employee (82%)
//   - 4 kinds of work
//
// IMPORTANT CONSTRAINT used throughout:
// A single employee works at most 6 days a week, because one weekly off is a
// hard rule. So any brand-process needing 7-day coverage CANNOT be staffed by
// one person. Every single-resource brand below therefore uses a calendar of
// 6 days a week or fewer -- except Vireo Living, which is deliberately
// impossible and is planted as a demo case.
// ---------------------------------------------------------------------------

/** Index 0 = Sunday ... 6 = Saturday. */
export type Calendar = {
  weekdayMask: boolean[];
  observesHolidays: boolean;
  label: string;
};

const T = true;
const F = false;

export const CALENDARS = {
  /** Open every day of the year, holidays included. 7 days/week. */
  ALL_365: {
    weekdayMask: [T, T, T, T, T, T, T],
    observesHolidays: false,
    label: "365 days a year, holidays included",
  },
  /** Open every day but closed on public holidays. 7 days/week. */
  DAILY_HOLIDAYS_OFF: {
    weekdayMask: [T, T, T, T, T, T, T],
    observesHolidays: true,
    label: "Every day, closed on public holidays",
  },
  /** Closed Sundays and public holidays. 6 days/week. */
  SUN_AND_HOLIDAYS_OFF: {
    weekdayMask: [F, T, T, T, T, T, T],
    observesHolidays: true,
    label: "Mon-Sat, closed on public holidays",
  },
  /** Weekdays only, closed on public holidays. 5 days/week. */
  WEEKDAYS: {
    weekdayMask: [F, T, T, T, T, T, F],
    observesHolidays: true,
    label: "Mon-Fri, closed on public holidays",
  },
  /**
   * Custom pattern #1 -- weekdays but works through public holidays.
   * Included to prove the calendar is data, not a fixed list of three options.
   */
  WEEKDAYS_THROUGH_HOLIDAYS: {
    weekdayMask: [F, T, T, T, T, T, F],
    observesHolidays: false,
    label: "Mon-Fri, open on public holidays",
  },
  /**
   * Custom pattern #2 -- Mon-Sat including public holidays.
   */
  MON_SAT_THROUGH_HOLIDAYS: {
    weekdayMask: [F, T, T, T, T, T, T],
    observesHolidays: false,
    label: "Mon-Sat, open on public holidays",
  },
} satisfies Record<string, Calendar>;

export type CalendarKey = keyof typeof CALENDARS;

// ---------------------------------------------------------------------------
// Pods
// ---------------------------------------------------------------------------

export const PODS = [
  { name: "Aurora", leadCode: "E01" },
  { name: "Beacon", leadCode: "E07" },
  { name: "Cobalt", leadCode: "E12" },
  { name: "Delta", leadCode: "E18" },
  { name: "Ember", leadCode: "E23" },
  { name: "Flint", leadCode: "E28" },
];

// ---------------------------------------------------------------------------
// Employees
//
// preferredWeeklyOff: 0 = Sunday ... 6 = Saturday.
// Most people prefer Sunday, which is realistic and also creates genuine
// contention the scheduler has to resolve.
// ---------------------------------------------------------------------------

export type SeedEmployee = {
  code: string;
  name: string;
  pod: string;
  preferredWeeklyOff: number;
  isPodLead?: boolean;
};

export const EMPLOYEES: SeedEmployee[] = [
  // --- Aurora ---
  { code: "E01", name: "Rhea Menon", pod: "Aurora", preferredWeeklyOff: 0, isPodLead: true },
  { code: "E02", name: "Arjun Pillai", pod: "Aurora", preferredWeeklyOff: 0 },
  { code: "E03", name: "Sneha Rao", pod: "Aurora", preferredWeeklyOff: 0 },
  { code: "E04", name: "Faisal Khan", pod: "Aurora", preferredWeeklyOff: 6 },
  { code: "E05", name: "Divya Shetty", pod: "Aurora", preferredWeeklyOff: 0 },
  { code: "E06", name: "Nikhil Joshi", pod: "Aurora", preferredWeeklyOff: 1 },

  // --- Beacon ---
  { code: "E07", name: "Kabir Shah", pod: "Beacon", preferredWeeklyOff: 0, isPodLead: true },
  { code: "E08", name: "Meera Iyer", pod: "Beacon", preferredWeeklyOff: 0 },
  { code: "E09", name: "Rohit Varma", pod: "Beacon", preferredWeeklyOff: 6 },
  { code: "E10", name: "Ananya Das", pod: "Beacon", preferredWeeklyOff: 0 },
  { code: "E11", name: "Imran Qureshi", pod: "Beacon", preferredWeeklyOff: 0 },

  // --- Cobalt ---
  { code: "E12", name: "Tanvi Deshpande", pod: "Cobalt", preferredWeeklyOff: 0, isPodLead: true },
  { code: "E13", name: "Siddharth Nair", pod: "Cobalt", preferredWeeklyOff: 0 },
  { code: "E14", name: "Pooja Bhatt", pod: "Cobalt", preferredWeeklyOff: 2 },
  { code: "E15", name: "Aman Gupta", pod: "Cobalt", preferredWeeklyOff: 0 },
  { code: "E16", name: "Lakshmi Reddy", pod: "Cobalt", preferredWeeklyOff: 6 },
  { code: "E17", name: "Varun Sethi", pod: "Cobalt", preferredWeeklyOff: 0 },

  // --- Delta ---
  { code: "E18", name: "Neha Kulkarni", pod: "Delta", preferredWeeklyOff: 0, isPodLead: true },
  { code: "E19", name: "Zaid Ansari", pod: "Delta", preferredWeeklyOff: 0 },
  { code: "E20", name: "Ritika Jain", pod: "Delta", preferredWeeklyOff: 0 },
  { code: "E21", name: "Harsh Patel", pod: "Delta", preferredWeeklyOff: 6 },
  { code: "E22", name: "Sana Merchant", pod: "Delta", preferredWeeklyOff: 0 },

  // --- Ember ---
  { code: "E23", name: "Vikram Chandra", pod: "Ember", preferredWeeklyOff: 0, isPodLead: true },
  { code: "E24", name: "Priya Narayan", pod: "Ember", preferredWeeklyOff: 0 },
  { code: "E25", name: "Omkar Pawar", pod: "Ember", preferredWeeklyOff: 1 },
  { code: "E26", name: "Shreya Ghosh", pod: "Ember", preferredWeeklyOff: 0 },
  { code: "E27", name: "Dev Malhotra", pod: "Ember", preferredWeeklyOff: 0 },

  // --- Flint ---
  { code: "E28", name: "Aisha Fernandes", pod: "Flint", preferredWeeklyOff: 0, isPodLead: true },
  { code: "E29", name: "Karthik Subramanian", pod: "Flint", preferredWeeklyOff: 0 },
  { code: "E30", name: "Juhi Kapoor", pod: "Flint", preferredWeeklyOff: 6 },
  { code: "E31", name: "Yash Trivedi", pod: "Flint", preferredWeeklyOff: 0 },
  { code: "E32", name: "Ira Bose", pod: "Flint", preferredWeeklyOff: 0 },
];

// ---------------------------------------------------------------------------
// Kinds of work
// ---------------------------------------------------------------------------

export const PROCESSES = [
  { code: "CS", name: "Customer Support", description: "Inbound tickets, chat and email" },
  { code: "ACC", name: "Abandoned Cart Conversions", description: "Outbound recovery of abandoned carts" },
  { code: "NDR", name: "Non-Delivery Reports", description: "Failed delivery follow-up and reattempts" },
  { code: "RET", name: "Retention", description: "Win-back and subscription retention outreach" },
];

// ---------------------------------------------------------------------------
// Brands, their lines of work, and who covers them
// ---------------------------------------------------------------------------

export type SeedBrandProcess = {
  process: string;
  calendar: CalendarKey;
  /**
   * Minimum people on an open day. A single number means the same every day,
   * which is what most clients want; use minStaffByWeekday where a client's
   * requirement varies by weekday.
   */
  minStaffPerDay: number;
  /** Per-weekday override, index 0 = Sunday. Seven entries. */
  minStaffByWeekday?: number[];
  /**
   * The employee(s) who OWN this line of work day to day. The first is the
   * primary owner. A brand counts as "single-resource" when it has exactly
   * one distinct owner across all its lines of work.
   */
  staff: string[];
  /**
   * Pod leads who can step in when an owner is away. Filled in automatically
   * below from LEAD_BACKUP, so the brand list above stays readable.
   *
   * Backups are real coverage -- without them a brand owned by one person and
   * open six days a week has literally zero slack, and a single day of leave
   * leaves the client uncovered. That is true in real operations too, which is
   * exactly why pod leads cover.
   */
  backup?: string[];
  notes?: string;
};

export type SeedBrand = {
  code: string;
  name: string;
  ownerPod: string;
  lines: SeedBrandProcess[];
};

export const BRANDS: SeedBrand[] = [
  // =========================================================================
  // 18 single-resource brands -- one employee covers every line of work.
  // =========================================================================
  {
    code: "LUM", name: "Lumos Skincare", ownerPod: "Aurora",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E02"] },
      { process: "ACC", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E02"] },
    ],
  },
  {
    code: "THT", name: "Thistle & Thread", ownerPod: "Aurora",
    lines: [{ process: "CS", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E03"] }],
  },
  {
    // ===== PLANTED DEMO CASE 1: impossible to staff =====
    // One employee, support required all 365 days. A person cannot work
    // 7 days a week, so this is arithmetically unstaffable. The feasibility
    // check must catch this BEFORE any scheduling happens.
    code: "VIR", name: "Vireo Living", ownerPod: "Aurora",
    lines: [
      {
        process: "CS", calendar: "ALL_365", minStaffPerDay: 1, staff: ["E04"],
        notes: "Contract requires cover every day of the year, including public holidays. No backup assigned.",
      },
    ],
  },
  {
    code: "PKF", name: "Peak Forge", ownerPod: "Aurora",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E05"] },
      { process: "NDR", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E05"] },
    ],
  },
  {
    code: "MAR", name: "Marigold Home", ownerPod: "Beacon",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E08"] },
      { process: "NDR", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E08"] },
    ],
  },
  {
    code: "SAB", name: "Sable Pet Co", ownerPod: "Beacon",
    lines: [{ process: "CS", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E09"] }],
  },
  {
    code: "CLV", name: "Clove & Co", ownerPod: "Beacon",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E10"] },
      { process: "ACC", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E10"] },
    ],
  },
  {
    code: "TNF", name: "Terra Nova Foods", ownerPod: "Cobalt",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E13"] },
      { process: "NDR", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E13"] },
    ],
  },
  {
    // Pooja Bhatt (E14) covers this brand AND Quill Stationery below.
    // Her working days serve both at once -- being present covers every
    // brand she is assigned to on that date.
    code: "RIV", name: "Rivet Apparel", ownerPod: "Cobalt",
    lines: [{ process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E14"] }],
  },
  {
    code: "HNY", name: "Honeywick", ownerPod: "Cobalt",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E15"] },
      { process: "RET", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E15"] },
    ],
  },
  {
    code: "SAF", name: "Saffron Lane", ownerPod: "Delta",
    lines: [
      {
        process: "CS", calendar: "WEEKDAYS_THROUGH_HOLIDAYS", minStaffPerDay: 1, staff: ["E19"],
        notes: "Weekdays only, but the client trades through public holidays.",
      },
    ],
  },
  {
    code: "BIR", name: "Birch Baby", ownerPod: "Delta",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E20"] },
      { process: "ACC", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E20"] },
    ],
  },
  {
    code: "QUI", name: "Quill Stationery", ownerPod: "Cobalt",
    lines: [{ process: "CS", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E14"] }],
  },
  {
    code: "IRN", name: "Ironwood Fitness", ownerPod: "Ember",
    lines: [
      {
        process: "CS", calendar: "MON_SAT_THROUGH_HOLIDAYS", minStaffPerDay: 1, staff: ["E24"],
        notes: "Gym chain -- trades Mon-Sat including public holidays.",
      },
      { process: "NDR", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E24"] },
    ],
  },
  {
    code: "PAM", name: "Pampas Decor", ownerPod: "Ember",
    lines: [{ process: "CS", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E25"] }],
  },
  {
    code: "NEC", name: "Nectar Beverages", ownerPod: "Ember",
    lines: [
      { process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E26"] },
      { process: "ACC", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E26"] },
    ],
  },
  {
    // Juhi Kapoor (E30) covers this brand AND Moss & Maple below.
    code: "CIN", name: "Cinder Coffee", ownerPod: "Flint",
    lines: [{ process: "CS", calendar: "SUN_AND_HOLIDAYS_OFF", minStaffPerDay: 1, staff: ["E30"] }],
  },
  {
    code: "MOS", name: "Moss & Maple", ownerPod: "Flint",
    lines: [
      { process: "CS", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E30"] },
      { process: "RET", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E30"] },
    ],
  },

  // =========================================================================
  // 4 multi-resource brands
  // =========================================================================
  {
    // ===== PLANTED DEMO CASE 3: nothing breaks =====
    // Three people share support with a minimum of 2 on duty. When one takes
    // leave, the other two still meet the minimum, so the honest answer is
    // "approve it, nothing breaks". The app must say that as clearly as it
    // reports a failure.
    code: "NWS", name: "Northwind Supply", ownerPod: "Cobalt",
    lines: [
      {
        // ===== PLANTED DEMO CASE 5: a minimum that varies by weekday =====
        // Mondays carry the weekend's unanswered tickets, so this client pays
        // for a third person on Mondays only. A single figure cannot express
        // that, which is why the column is a per-weekday array.
        process: "CS", calendar: "DAILY_HOLIDAYS_OFF", minStaffPerDay: 2,
        minStaffByWeekday: [2, 3, 2, 2, 2, 2, 2],
        staff: ["E16", "E17", "E29"],
        notes: "High volume account. Two on duty daily, three on Mondays to clear the weekend backlog.",
      },
      { process: "NDR", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E16"] },
    ],
  },
  {
    // ===== PLANTED DEMO CASE 2: fixable by swapping a day off =====
    // Two people cover 365-day support with a minimum of 1. When one is away,
    // the repair pass should quietly move the other person's day off and
    // report that it did so.
    code: "HRL", name: "Harlow & Co", ownerPod: "Beacon",
    lines: [
      {
        process: "CS", calendar: "ALL_365", minStaffPerDay: 1, staff: ["E11", "E22"],
        notes: "Premium support contract, cover every day including holidays.",
      },
      { process: "ACC", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E11"] },
    ],
  },
  {
    // ===== PLANTED DEMO CASE 4: two calendars under one client =====
    // Support runs 7 days a week. Cart recovery runs weekdays only.
    // This is the case that justifies BrandProcess existing at all -- if the
    // calendar lived on Brand, this could not be expressed.
    code: "CAS", name: "Castellan Leather", ownerPod: "Delta",
    lines: [
      {
        process: "CS", calendar: "ALL_365", minStaffPerDay: 1, staff: ["E21", "E27"],
        notes: "Support runs every day of the year.",
      },
      {
        process: "ACC", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E21"],
        notes: "Cart recovery runs weekdays only -- a different calendar to CS at the same brand.",
      },
    ],
  },
  {
    // Overlapping process assignment: three people on the SAME line of work.
    // Nikhil Joshi (E06) sits in the Aurora pod but works on a Flint brand,
    // which is realistic and makes backup search across pods meaningful.
    code: "ORC", name: "Orchid Wellness", ownerPod: "Flint",
    lines: [
      {
        process: "CS", calendar: "DAILY_HOLIDAYS_OFF", minStaffPerDay: 2,
        staff: ["E31", "E32", "E06"],
        notes: "Three people share this line of work, two on duty each day.",
      },
      { process: "RET", calendar: "WEEKDAYS", minStaffPerDay: 1, staff: ["E31"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Public holidays
//
// Illustrative sample data for the assessment, not an authoritative calendar.
// Editable in the app, as the brief requires.
// ---------------------------------------------------------------------------

export const HOLIDAYS = [
  { date: "2026-01-26", name: "Republic Day" },
  { date: "2026-03-04", name: "Holi" },
  { date: "2026-03-21", name: "Id-ul-Fitr" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "Maharashtra Day" },
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-08-28", name: "Ganesh Chaturthi" },
  { date: "2026-10-02", name: "Gandhi Jayanti" },
  { date: "2026-11-08", name: "Diwali" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-26", name: "Republic Day" },
];

// ---------------------------------------------------------------------------
// Leave, inside the demo month
//
// December 2026 starts on a Tuesday. Sundays fall on the 6th, 13th, 20th
// and 27th. Christmas Day (the 25th) is a Friday.
// ---------------------------------------------------------------------------

export const DEMO_MONTH = "2026-12";

export type SeedLeave = {
  employee: string;
  date: string;
  type: "PLANNED" | "COMP_OFF" | "SICK";
  reason?: string;
};

export const LEAVES: SeedLeave[] = [
  // --- The three leaves that drive the demo ---
  {
    employee: "E04", date: "2026-12-10", type: "PLANNED",
    reason: "Family wedding. Faisal is the ONLY person on Vireo Living, which needs cover every day.",
  },
  {
    employee: "E22", date: "2026-12-08", type: "PLANNED",
    reason: "One of two people on Harlow & Co support -- the other should be able to absorb this.",
  },
  {
    employee: "E29", date: "2026-12-15", type: "PLANNED",
    reason: "One of three on Northwind support, which needs two. The remaining two still meet it.",
  },

  // --- Ordinary leave spread through the month ---
  { employee: "E02", date: "2026-12-17", type: "PLANNED" },
  { employee: "E02", date: "2026-12-18", type: "PLANNED" },
  { employee: "E05", date: "2026-12-22", type: "COMP_OFF", reason: "Comp-off for Diwali cover" },
  { employee: "E09", date: "2026-12-03", type: "SICK" },
  { employee: "E10", date: "2026-12-14", type: "PLANNED" },
  { employee: "E13", date: "2026-12-28", type: "PLANNED" },
  { employee: "E13", date: "2026-12-29", type: "PLANNED" },
  { employee: "E14", date: "2026-12-02", type: "SICK" },
  { employee: "E15", date: "2026-12-11", type: "COMP_OFF" },
  { employee: "E16", date: "2026-12-18", type: "PLANNED" },
  { employee: "E19", date: "2026-12-23", type: "PLANNED" },
  { employee: "E20", date: "2026-12-30", type: "PLANNED" },
  { employee: "E24", date: "2026-12-07", type: "SICK" },
  { employee: "E25", date: "2026-12-16", type: "COMP_OFF" },
  { employee: "E26", date: "2026-12-21", type: "PLANNED" },
  { employee: "E27", date: "2026-12-31", type: "PLANNED" },
  { employee: "E30", date: "2026-12-04", type: "PLANNED" },
  { employee: "E31", date: "2026-12-09", type: "PLANNED" },
  { employee: "E32", date: "2026-12-24", type: "COMP_OFF" },
];

// ---------------------------------------------------------------------------
// Pod leads as backup cover
//
// Each lead backs up the single-resource brands inside their own pod. This is
// what makes the dataset survivable: a brand owned by one person and open six
// days a week has no slack at all on its own.
//
// Vireo Living is DELIBERATELY ABSENT from this list. It was onboarded with
// one resource on a 365-day contract and no backup was ever assigned -- which
// is precisely the situation the brief describes, and the thing the
// feasibility check has to catch.
// ---------------------------------------------------------------------------

export const LEAD_BACKUP: Record<string, string> = {
  // Aurora -- Rhea Menon
  LUM: "E01", THT: "E01", PKF: "E01",
  // Beacon -- Kabir Shah
  MAR: "E07", SAB: "E07", CLV: "E07",
  // Cobalt -- Tanvi Deshpande
  TNF: "E12", RIV: "E12", HNY: "E12", QUI: "E12",
  // Delta -- Neha Kulkarni
  SAF: "E18", BIR: "E18",
  // Ember -- Vikram Chandra
  IRN: "E23", PAM: "E23", NEC: "E23",
  // Flint -- Aisha Fernandes
  CIN: "E28", MOS: "E28",
};

for (const brand of BRANDS) {
  const lead = LEAD_BACKUP[brand.code];
  if (!lead) continue;
  for (const line of brand.lines) {
    line.backup = [...(line.backup ?? []), lead];
  }
}

/**
 * A brand is single-resource when exactly one person OWNS it, regardless of
 * who can step in. This is the figure the brief's ~80% refers to.
 */
export function ownerCount(brand: SeedBrand): number {
  return new Set(brand.lines.flatMap((l) => l.staff)).size;
}
