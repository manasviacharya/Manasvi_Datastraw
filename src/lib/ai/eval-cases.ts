/**
 * Test cases for the plain-English rule parser.
 *
 * Each case has a known-correct answer, written by hand from the wording. The
 * eval runner scores the parser against these and reports accuracy, which goes
 * in the README. The point is to be able to say "14 of 15, and here are the
 * two it missed" rather than "it works".
 *
 * Deliberately includes awkward phrasings, because the easy ones prove nothing.
 */

const T = true;
const F = false;

export type RuleCase = {
  id: string;
  text: string;
  expect: {
    weekdayMask: boolean[];
    observesHolidays: boolean;
    minStaffPerDay: number;
  };
  /** What this case is testing. */
  note: string;
  /** True when the deterministic rules are expected to handle it alone. */
  expectRulesOnly?: boolean;
};

export const RULE_CASES: RuleCase[] = [
  // --- The three patterns named in the brief -------------------------------
  {
    id: "r01",
    text: "Customer support needs cover every day of the year including public holidays, minimum 1 person.",
    expect: { weekdayMask: [T, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 1 },
    note: "Pattern 1 from the brief: 365-day operation.",
    expectRulesOnly: true,
  },
  {
    id: "r02",
    text: "Runs every day but closed on public holidays.",
    expect: { weekdayMask: [T, T, T, T, T, T, T], observesHolidays: T, minStaffPerDay: 1 },
    note: "Pattern 2: daily with holidays off.",
    expectRulesOnly: true,
  },
  {
    id: "r03",
    text: "Sundays and public holidays off.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: T, minStaffPerDay: 1 },
    note: "Pattern 3: Sundays and holidays off.",
    expectRulesOnly: true,
  },

  // --- Common real phrasings -----------------------------------------------
  {
    id: "r04",
    text: "Monday to Friday, closed on public holidays.",
    expect: { weekdayMask: [F, T, T, T, T, T, F], observesHolidays: T, minStaffPerDay: 1 },
    note: "Weekday operation stated as a range.",
    expectRulesOnly: true,
  },
  {
    id: "r05",
    text: "Weekdays only, minimum 2 people.",
    expect: { weekdayMask: [F, T, T, T, T, T, F], observesHolidays: T, minStaffPerDay: 2 },
    note: "The word weekdays, plus a numeric minimum.",
    expectRulesOnly: true,
  },
  {
    id: "r06",
    text: "Mon-Sat with at least two agents on duty, closed on holidays.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: T, minStaffPerDay: 2 },
    note: "Abbreviated range and a spelled-out number.",
    expectRulesOnly: true,
  },
  {
    id: "r07",
    text: "Cover is needed 7 days a week, holidays included, with 3 people每day.",
    expect: { weekdayMask: [T, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 3 },
    note: "Stray non-English characters, which happens with pasted text.",
  },
  {
    id: "r08",
    text: "Open all week except Sunday. We work through public holidays.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 1 },
    note: "An exception phrased as 'except', plus working through holidays.",
    expectRulesOnly: true,
  },

  // --- Harder wording -------------------------------------------------------
  {
    id: "r09",
    text: "The client trades six days a week, taking Sundays off, and expects a minimum of one agent. Public holidays are working days for this account.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 1 },
    note: "Long sentence, holiday rule stated at the end and inverted.",
  },
  {
    id: "r10",
    text: "No weekend cover required. Holidays off.",
    expect: { weekdayMask: [F, T, T, T, T, T, F], observesHolidays: T, minStaffPerDay: 1 },
    note: "'Weekend' has to be understood as Saturday and Sunday together.",
  },
  {
    id: "r11",
    text: "Saturday and Sunday only, minimum 1.",
    expect: { weekdayMask: [T, F, F, F, F, F, T], observesHolidays: T, minStaffPerDay: 1 },
    note: "Inverted: weekend-only cover, which is unusual but legitimate.",
  },
  {
    id: "r12",
    text: "Daily cover, holidays included, at least four people on shift.",
    expect: { weekdayMask: [T, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 4 },
    note: "'Daily' plus a spelled-out number above three.",
    expectRulesOnly: true,
  },
  {
    id: "r13",
    text: "Every day except Tuesdays and public holidays.",
    expect: { weekdayMask: [T, T, F, T, T, T, T], observesHolidays: T, minStaffPerDay: 1 },
    note: "A midweek closure, which no standard pattern covers.",
  },
  {
    id: "r14",
    text: "Round the clock support, 365 days, two agents minimum at all times.",
    expect: { weekdayMask: [T, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 2 },
    note: "'365' implies holidays are worked even though they are not named.",
    expectRulesOnly: true,
  },
  {
    id: "r15",
    text: "Mon, Wed and Fri only. Closed public holidays. One person is enough.",
    expect: { weekdayMask: [F, T, F, T, F, T, F], observesHolidays: T, minStaffPerDay: 1 },
    note: "A non-contiguous set of days listed individually.",
  },

  // --- Cases the deterministic rules are NOT expected to handle ------------
  // These exist so the Gemini fallback is actually measured. Without them the
  // rules solve everything and any "AI accuracy" figure would really be a
  // rules figure wearing a different label.
  {
    id: "r16",
    text: "We need somebody around whenever the warehouse is open, which is all week bar the sabbath, and never fewer than a pair of them.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: T, minStaffPerDay: 2 },
    note: "FALLBACK: 'bar the sabbath' for Sunday, 'a pair' for two.",
  },
  {
    id: "r17",
    text: "Support must never go dark, not even at Christmas. One body minimum.",
    expect: { weekdayMask: [T, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 1 },
    note: "FALLBACK: 'never go dark' implies every day; Christmas implies holidays worked.",
  },
  {
    id: "r18",
    text: "Cover from the start of the working week right through to the end of it, and we down tools on national holidays.",
    expect: { weekdayMask: [F, T, T, T, T, T, F], observesHolidays: T, minStaffPerDay: 1 },
    note: "FALLBACK: the working week described without naming any day.",
  },
  {
    id: "r19",
    text: "Mirror the shops: shut one day a week, that being Sunday, and shut for public holidays too. Just the one person needed.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: T, minStaffPerDay: 1 },
    note: "FALLBACK: the closed day named only in a subordinate clause.",
  },
  {
    id: "r20",
    text: "Half a dozen days of trading, Monday onwards, resting on the seventh. Holidays are business as usual. Staff it with three.",
    expect: { weekdayMask: [F, T, T, T, T, T, T], observesHolidays: F, minStaffPerDay: 3 },
    note: "FALLBACK: 'half a dozen', 'resting on the seventh', 'business as usual'.",
  },
];

/** Did the parser get this case exactly right? */
export function matches(
  actual: { weekdayMask: boolean[]; observesHolidays: boolean; minStaffPerDay: number },
  expected: RuleCase["expect"]
): { pass: boolean; wrong: string[] } {
  const wrong: string[] = [];

  const maskMatch =
    actual.weekdayMask.length === 7 &&
    actual.weekdayMask.every((v, i) => v === expected.weekdayMask[i]);
  if (!maskMatch) {
    const show = (m: boolean[]) =>
      m.map((v, i) => (v ? "SMTWTFS"[i] : "·")).join("");
    wrong.push(`days: got ${show(actual.weekdayMask)}, expected ${show(expected.weekdayMask)}`);
  }
  if (actual.observesHolidays !== expected.observesHolidays) {
    wrong.push(
      `holidays: got ${actual.observesHolidays ? "closed" : "open"}, expected ${expected.observesHolidays ? "closed" : "open"}`
    );
  }
  if (actual.minStaffPerDay !== expected.minStaffPerDay) {
    wrong.push(`min staff: got ${actual.minStaffPerDay}, expected ${expected.minStaffPerDay}`);
  }

  return { pass: wrong.length === 0, wrong };
}
