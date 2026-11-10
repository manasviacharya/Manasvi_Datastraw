/**
 * Measures the plain-English rule parser against known-correct answers.
 *
 *   npm run test:ai
 *
 * Runs in two modes depending on whether any provider key is set:
 *
 *   rules only  -- scores the deterministic parser on its own. This is what
 *                  the app falls back to with no key, so it needs its own
 *                  number rather than being hidden behind the model's.
 *   full        -- rules first, then the provider chain (Gemini, then Groq)
 *                  for anything the rules do not recognise. This is what a
 *                  user actually experiences.
 *
 * Reporting both is the honest thing to do. It separates "the parser works"
 * from "the model rescues it", and it shows exactly how much the AI is adding.
 */

import { aiStatus } from "../src/lib/ai/providers";
import { matches, RULE_CASES } from "../src/lib/ai/eval-cases";
import { parseRule, parseRuleWithRules } from "../src/lib/ai/rule-parser";

type Outcome = {
  id: string;
  note: string;
  text: string;
  status: "pass" | "fail" | "unhandled";
  source?: "rules" | "ai";
  wrong: string[];
  message?: string;
};

function bar(n: number, total: number, width = 28): string {
  const filled = total === 0 ? 0 : Math.round((n / total) * width);
  return "#".repeat(filled) + ".".repeat(width - filled);
}

async function runRulesOnly(): Promise<Outcome[]> {
  return RULE_CASES.map((c) => {
    const parsed = parseRuleWithRules(c.text);
    if (!parsed) {
      return {
        id: c.id,
        note: c.note,
        text: c.text,
        status: "unhandled" as const,
        wrong: [],
        message: "Not recognised by the deterministic rules.",
      };
    }
    const { pass, wrong } = matches(parsed, c.expect);
    return {
      id: c.id,
      note: c.note,
      text: c.text,
      status: pass ? ("pass" as const) : ("fail" as const),
      source: "rules" as const,
      wrong,
    };
  });
}

async function runFull(): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const c of RULE_CASES) {
    const res = await parseRule(c.text);
    if (!res.ok) {
      out.push({
        id: c.id,
        note: c.note,
        text: c.text,
        status: "unhandled",
        wrong: [],
        message: res.message,
      });
      continue;
    }
    const { pass, wrong } = matches(res.rule, c.expect);
    out.push({
      id: c.id,
      note: c.note,
      text: c.text,
      status: pass ? "pass" : "fail",
      source: res.rule.source,
      wrong,
    });
  }
  return out;
}

function report(title: string, outcomes: Outcome[]): { passed: number; total: number } {
  const total = outcomes.length;
  const passed = outcomes.filter((o) => o.status === "pass").length;
  const failed = outcomes.filter((o) => o.status === "fail");
  const unhandled = outcomes.filter((o) => o.status === "unhandled");
  const byRules = outcomes.filter((o) => o.status === "pass" && o.source === "rules").length;
  const byAi = outcomes.filter((o) => o.status === "pass" && o.source === "ai").length;

  const pct = total === 0 ? 0 : Math.round((passed / total) * 1000) / 10;

  console.log(`\n  ${title}`);
  console.log(`  ${"-".repeat(70)}`);
  console.log(`  ${bar(passed, total)}  ${passed}/${total} correct  (${pct}%)`);
  if (byAi > 0 || byRules > 0) {
    console.log(`  solved by rules: ${byRules}   solved by a model: ${byAi}`);
  }
  if (unhandled.length > 0) {
    console.log(`  not recognised: ${unhandled.length}`);
  }

  for (const o of failed) {
    console.log(`\n  WRONG  ${o.id}  (${o.source ?? "?"})  ${o.note}`);
    console.log(`         "${o.text}"`);
    for (const w of o.wrong) console.log(`         ${w}`);
  }
  for (const o of unhandled) {
    console.log(`\n  MISSED ${o.id}  ${o.note}`);
    console.log(`         "${o.text}"`);
    if (o.message) console.log(`         ${o.message}`);
  }

  return { passed, total };
}

async function main() {
  console.log(`\n${"=".repeat(74)}`);
  console.log("  RULE PARSER ACCURACY");
  console.log(`${"=".repeat(74)}`);
  console.log(`  ${RULE_CASES.length} rules written in plain English, each with a known answer.`);
  console.log(`  A case passes only if the operating days, the holiday rule and the`);
  console.log(`  minimum headcount are ALL correct.`);

  const rulesOnly = await runRulesOnly();
  const r = report("DETERMINISTIC RULES ONLY  (what runs with no API key)", rulesOnly);

  let f = { passed: 0, total: 0 };
  if (aiStatus().enabled) {
    const full = await runFull();
    f = report(
      `RULES + MODEL FALLBACK  (chain: ${aiStatus().order.join(" -> ")})`,
      full
    );
  } else {
    console.log(`\n  RULES + MODEL FALLBACK`);
    console.log(`  ${"-".repeat(70)}`);
    console.log(`  Skipped: no AI provider is configured.`);
    console.log(`  Set GEMINI_API_KEY or GROQ_API_KEY in .env to measure the full pipeline.`);
  }

  console.log(`\n  SUMMARY`);
  console.log(`  ${"-".repeat(70)}`);
  console.log(`  Rules only:      ${r.passed}/${r.total}`);
  console.log(
    `  Rules + model:   ${aiStatus().enabled ? `${f.passed}/${f.total}` : "not measured (no key)"}`
  );
  console.log(
    `\n  Note: the parser never writes to the database. It fills in a form that`
  );
  console.log(`  a human confirms, so a wrong answer is corrected, not committed.`);
  console.log(`\n${"=".repeat(74)}\n`);

  // Non-zero exit if the deterministic parser regresses on what it claims to
  // handle, so this can gate a commit.
  const shouldHandle = RULE_CASES.filter((c) => c.expectRulesOnly);
  const regressions = shouldHandle.filter((c) => {
    const o = rulesOnly.find((x) => x.id === c.id);
    return o?.status !== "pass";
  });
  if (regressions.length > 0) {
    console.error(
      `  ${regressions.length} case(s) the rules are expected to handle regressed: ` +
        regressions.map((c) => c.id).join(", ")
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
