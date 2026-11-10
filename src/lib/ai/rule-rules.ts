/**
 * The deterministic half of the rule parser.
 *
 * Kept in its own file because it is the half that runs when no API key is
 * configured, and it deserves to be readable and tested on its own terms
 * rather than treated as a rough pre-filter.
 *
 * The approach is not keyword matching on whole phrasings -- that breaks the
 * moment someone writes a sentence slightly differently. Instead it finds
 * every mention of a day or of public holidays, then decides for each mention
 * whether it is being INCLUDED or EXCLUDED by looking at the words immediately
 * around it. "Sundays off", "except Sunday" and "no weekend cover" are three
 * spellings of the same exclusion.
 */

const ALL = () => [true, true, true, true, true, true, true];
const NONE = () => [false, false, false, false, false, false, false];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Longest spellings first, so "sat" does not win inside "saturday". */
const DAY_TOKENS: { token: string; days: number[] }[] = [
  { token: "sundays", days: [0] },
  { token: "sunday", days: [0] },
  { token: "mondays", days: [1] },
  { token: "monday", days: [1] },
  { token: "tuesdays", days: [2] },
  { token: "tuesday", days: [2] },
  { token: "tues", days: [2] },
  { token: "wednesdays", days: [3] },
  { token: "wednesday", days: [3] },
  { token: "thursdays", days: [4] },
  { token: "thursday", days: [4] },
  { token: "thurs", days: [4] },
  { token: "fridays", days: [5] },
  { token: "friday", days: [5] },
  { token: "saturdays", days: [6] },
  { token: "saturday", days: [6] },
  { token: "weekends", days: [0, 6] },
  { token: "weekend", days: [0, 6] },
  { token: "weekdays", days: [1, 2, 3, 4, 5] },
  { token: "weekday", days: [1, 2, 3, 4, 5] },
  { token: "sun", days: [0] },
  { token: "mon", days: [1] },
  { token: "tue", days: [2] },
  { token: "wed", days: [3] },
  { token: "thu", days: [4] },
  { token: "fri", days: [5] },
  { token: "sat", days: [6] },
];

const SHORT_TO_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const NEGATION_BEFORE =
  /\b(?:except|excluding|apart from|other than|besides|save for|bar|no|not|without|closed|shut|shuts|shutting|off|skip|skips|suspended|resting)\b[^.;!?]{0,24}$/;
/**
 * A negation AFTER a mention stops at a comma, because a clause following a
 * comma usually refers to something else:
 *
 *   "Sundays and public holidays off"      -> "off" applies to Sundays
 *   "Monday to Friday, closed on holidays" -> "closed" applies to the holidays,
 *                                             NOT to Friday
 *
 * A negation BEFORE a mention deliberately does not stop at a comma, since
 * "Mon-Sat, closed on Sundays" is a normal way to write an exclusion.
 */
const NEGATION_AFTER = /^[^.;!?,]{0,22}\b(?:off|closed|not required|unavailable)\b/;

/**
 * Is the mention at this position being excluded rather than included?
 *
 * Looks backwards and forwards, but never across a sentence boundary --
 * "Sundays off. Public holidays are working days" must not let the "off" from
 * the first sentence contaminate the second.
 */
function isNegated(text: string, start: number, end: number): boolean {
  const sentenceStart = Math.max(
    text.lastIndexOf(".", start - 1),
    text.lastIndexOf(";", start - 1),
    text.lastIndexOf("!", start - 1),
    text.lastIndexOf("?", start - 1)
  );
  const before = text.slice(Math.max(sentenceStart + 1, 0), start);
  const after = text.slice(end);

  return NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after);
}

type Mention = { days: number[]; start: number; end: number; negated: boolean };

function findDayMentions(t: string): Mention[] {
  const found: Mention[] = [];
  const claimed: boolean[] = new Array(t.length).fill(false);

  for (const { token, days } of DAY_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      // Skip if a longer token already covered this span.
      if (claimed[m.index]) continue;
      for (let i = m.index; i < m.index + token.length; i++) claimed[i] = true;
      found.push({
        days,
        start: m.index,
        end: m.index + token.length,
        negated: isNegated(t, m.index, m.index + token.length),
      });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/** "mon to fri", "mon-sat", "monday through friday" */
function findRange(t: string): boolean[] | null {
  const re =
    /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|–|—|to|through|thru|till|until)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/;
  const m = t.match(re);
  if (!m) return null;

  const from = SHORT_TO_INDEX[m[1]];
  const to = SHORT_TO_INDEX[m[2]];
  if (from === undefined || to === undefined) return null;

  const mask = NONE();
  // Walk forwards, wrapping, so "sat to mon" also works.
  for (let i = from; ; i = (i + 1) % 7) {
    mask[i] = true;
    if (i === to) break;
  }
  return mask;
}

export type RuleParseResult = {
  weekdayMask: boolean[];
  observesHolidays: boolean;
  minStaffPerDay: number;
  explanation: string;
  warnings: string[];
};

/**
 * Parse a coverage rule using rules alone. Returns null when there is not
 * enough signal to be confident, which hands the text to the model instead.
 */
/**
 * Quantity words the rules cannot turn into a number.
 *
 * Their presence means the sentence is almost certainly stating a headcount in
 * a way we did not capture, so answering "1 person" would be confidently
 * wrong. Better to abstain and let the model try.
 */
const UNKNOWN_QUANTITY =
  /\b(?:a pair|pair of|a couple|couple of|dozen|a trio|trio of|brace of|handful|several|a few|numerous|fourth|fifth|sixth|seventh)\b/;

/**
 * Longer than this, a sentence that the rules only partly understood is
 * probably saying more than they caught.
 */
const LONG_SENTENCE_WORDS = 14;

export function parseWithRules(input: string): RuleParseResult | null {
  const t = input.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Abstain early when the text contains a quantity we cannot read. Returning
  // a default of 1 here would be the worst outcome: a wrong answer presented
  // with the same confidence as a right one.
  if (UNKNOWN_QUANTITY.test(t)) return null;

  const warnings: string[] = [];
  const parts: string[] = [];

  // --- minimum headcount ---------------------------------------------------
  let minStaff = 1;
  let minStated = false;

  const numWords = Object.keys(NUMBER_WORDS).join("|");
  const afterKeyword = t.match(
    new RegExp(`\\b(?:minimum|min|at least|no fewer than)\\s+(?:of\\s+)?(\\d+|${numWords})\\b`)
  );
  const beforeNoun = t.match(
    new RegExp(`\\b(\\d+|${numWords})\\s+(?:people|person|agents?|staff|resources?|bodies)\\b`)
  );
  const chosen = afterKeyword?.[1] ?? beforeNoun?.[1];
  if (chosen) {
    minStaff = /^\d+$/.test(chosen) ? Number(chosen) : NUMBER_WORDS[chosen];
    minStated = true;
  }
  if (!Number.isInteger(minStaff) || minStaff < 1 || minStaff > 20) return null;

  // --- public holidays -----------------------------------------------------
  // "365" and "round the clock" imply holidays are worked even when the word
  // holiday never appears.
  const impliesAlwaysOpen = /\b(?:365|round the clock|24\/7|every day of the year)\b/.test(t);

  let observesHolidays: boolean | null = null;
  const holidayRe = /\b(?:public |bank |national )?holidays?\b/g;
  let hm: RegExpExecArray | null;
  while ((hm = holidayRe.exec(t)) !== null) {
    observesHolidays = isNegated(t, hm.index, hm.index + hm[0].length);
  }
  if (observesHolidays === null && impliesAlwaysOpen) observesHolidays = false;

  // --- operating days ------------------------------------------------------
  const mentions = findDayMentions(t);
  const included = mentions.filter((m) => !m.negated);
  const excluded = mentions.filter((m) => m.negated);

  // "only" has to sit NEXT TO a day to restrict the days.
  //
  // Searching the whole sentence for the word was wrong: in "shut one day a
  // week, that being Sunday ... Just the one person needed", the "just"
  // qualifies the headcount, and reading it as a day restriction produced a
  // Sunday-only roster for a six-day client.
  const onlyish = included.some((m) =>
    /^[^.;!?]{0,12}\b(?:only|alone)\b/.test(t.slice(m.end))
  );

  let mask: boolean[] | null = null;

  const range = findRange(t);
  if (range) {
    mask = range;
    parts.push(`open ${describeMask(range)}`);
  } else if (/\b(?:every ?day|everyday|all days?|all week|7 days|seven days|daily|365|round the clock|24\/7)\b/.test(t)) {
    mask = ALL();
    parts.push("open every day");
  } else if (/\b(?:six days|6 days)\b/.test(t)) {
    // Six days a week, with the closed day usually named separately.
    mask = ALL();
    parts.push("open six days a week");
  } else if (onlyish && included.length > 0) {
    mask = NONE();
    for (const m of included) for (const d of m.days) mask[d] = true;
    parts.push(`open ${describeMask(mask)} only`);
  }
  // There is deliberately no branch here for "some days were mentioned, so
  // those must be the operating days". Naming a day does not mean it is the
  // only one -- "we shut one day a week, that being Sunday" names Sunday and
  // means the opposite. Without a range, an every-day phrase, or an adjacent
  // "only", the sentence has not actually told us the operating days, so the
  // rules abstain and the model gets it instead.

  // Apply exclusions on top of whatever base was found.
  if (excluded.length > 0) {
    if (!mask) {
      mask = ALL();
      parts.push("open every day");
    }
    const removed: number[] = [];
    for (const m of excluded) {
      for (const d of m.days) {
        if (mask[d]) removed.push(d);
        mask[d] = false;
      }
    }
    if (removed.length > 0) {
      parts.push(`closed ${[...new Set(removed)].map((d) => DAY_NAMES[d]).join(" and ")}`);
    }
  }

  // Not enough to be confident. Let the model try.
  if (!mask && observesHolidays === null) return null;

  if (!mask) {
    mask = ALL();
    warnings.push("No operating days were stated, so every day was assumed.");
    parts.unshift("open every day (assumed)");
  }
  if (!mask.some(Boolean)) return null;

  if (observesHolidays === null) {
    observesHolidays = true;
    warnings.push(
      "Public holidays were not mentioned, so this line was assumed to close on them."
    );
    parts.push("closed on public holidays (assumed)");
  } else {
    parts.push(
      observesHolidays ? "closed on public holidays" : "works through public holidays"
    );
  }

  if (minStated) {
    parts.push(`minimum ${minStaff} on duty`);
  } else {
    warnings.push("No minimum was stated, so one person a day was assumed.");
    parts.push("minimum 1 on duty (assumed)");
  }

  // Final confidence check. Guessing at part of a short sentence is usually
  // fine -- "weekdays only" genuinely does not mention holidays. Guessing at
  // part of a LONG one means we probably missed a clause, so hand it over
  // rather than answering with authority we have not earned.
  const wordCount = t.split(/\s+/).length;
  if (warnings.length > 0 && wordCount > LONG_SENTENCE_WORDS) return null;

  return {
    weekdayMask: mask,
    observesHolidays,
    minStaffPerDay: minStaff,
    explanation: `Read as: ${parts.join(", ")}.`,
    warnings,
  };
}

/** "Mon-Fri", "Sun and Sat", "Every day" */
export function describeMask(mask: boolean[]): string {
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const open = mask.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

  if (open.length === 7) return "every day";
  if (open.length === 0) return "never";

  const contiguous = open.every((v, i) => i === 0 || v === open[i - 1] + 1);
  if (contiguous && open.length > 2) {
    return `${SHORT[open[0]]}-${SHORT[open.at(-1)!]}`;
  }
  return open.map((i) => SHORT[i]).join(", ");
}
