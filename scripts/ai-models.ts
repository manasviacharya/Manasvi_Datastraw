/**
 * Asks each configured provider what models it will actually serve.
 *
 *   npm run ai:models
 *
 * This exists because a retired Gemini model cost real debugging time: the
 * docs named one model, the API had removed it, and its own error message
 * suggested a replacement that also did not exist. Asking the provider is the
 * only reliable way to know.
 */

import { aiStatus, listModels, type ProviderName } from "../src/lib/ai/providers";

const INTERESTING = /flash|pro|llama|gpt|mixtral|qwen|kimi|gemma/i;

async function main() {
  const status = aiStatus();

  console.log(`\n${"=".repeat(70)}`);
  console.log("  AI PROVIDERS");
  console.log(`${"=".repeat(70)}`);

  if (!status.enabled) {
    console.log("\n  Nothing configured. Set GEMINI_API_KEY and/or GROQ_API_KEY in .env.");
    console.log("  The app works without either -- see the README.\n");
    return;
  }

  console.log(`\n  Fallback order: ${status.order.join(" -> ")}`);
  for (const p of status.providers) {
    console.log(`    ${p.provider.padEnd(8)} using ${p.model}`);
  }

  for (const provider of status.order as ProviderName[]) {
    console.log(`\n  ${provider.toUpperCase()}`);
    console.log(`  ${"-".repeat(66)}`);
    const res = await listModels(provider);
    if (!res.ok) {
      console.log(`  could not list models: ${res.message}`);
      continue;
    }
    const configured = status.providers.find((p) => p.provider === provider)?.model;
    const shown = res.models.filter((m) => INTERESTING.test(m));
    for (const m of shown.slice(0, 30)) {
      console.log(`  ${m === configured ? "*" : " "} ${m}`);
    }
    if (shown.length > 30) console.log(`    ...and ${shown.length - 30} more`);
    if (configured && !res.models.includes(configured)) {
      console.log(`\n  WARNING: configured model "${configured}" is NOT in this list.`);
      console.log(`  Requests to ${provider} will fail. Pick one of the above.`);
    }
  }
  console.log(`\n${"=".repeat(70)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
