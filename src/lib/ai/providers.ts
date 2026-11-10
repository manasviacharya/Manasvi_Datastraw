/**
 * Language model access, with a fallback chain.
 *
 * WHY THERE ARE TWO PROVIDERS
 *
 * Gemini proved unreliable in practice during this build: the model name in
 * the docs had been retired, the error message suggested a replacement that
 * the API does not actually serve, and a one-word reply took eleven seconds.
 * A single provider meant a single point of failure for both AI features.
 *
 * So requests try each configured provider in order and stop at the first
 * success. Groq runs Llama models on their own hardware and is typically an
 * order of magnitude faster, which makes it a good second choice -- and a
 * better one than a retry against a provider that just failed.
 *
 * Order is configurable with AI_PROVIDER_ORDER. The default is "gemini,groq".
 *
 * THE IMPORTANT PROPERTY, unchanged: none of this is load-bearing. With no
 * keys at all the rule parser falls back to its deterministic path and the
 * written summary hides itself. Nothing in the scheduler touches this file.
 */

export type ProviderName = "gemini" | "groq";

export type Attempt = {
  provider: ProviderName;
  model: string;
  ok: boolean;
  ms: number;
  /** Why it failed, when it did. */
  error?: string;
};

export type TextResult =
  | { ok: true; text: string; provider: ProviderName; model: string; ms: number; attempts: Attempt[] }
  | { ok: false; reason: "disabled" | "error"; message: string; attempts: Attempt[] };

export type Request = {
  /** Steering instructions, kept separate from the user's words. */
  system: string;
  /** The user's text. Treated as data, never as instructions. */
  user: string;
  temperature?: number;
  /** Ask for JSON back. The shape still has to be validated by the caller. */
  json?: boolean;
  /** Per-provider budget, not a total for the chain. */
  timeoutMs?: number;
  maxOutputTokens?: number;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULTS: Record<ProviderName, { model: string; timeoutMs: number }> = {
  // Slower but stronger. Measured at ~11s for a one-word reply because it
  // reasons before emitting, so it needs a generous budget.
  gemini: { model: "gemini-3.5-flash", timeoutMs: 60_000 },
  // Far faster: measured at ~0.5s for the same work Gemini takes 11-50s over.
  // A short timeout is therefore realistic, and keeps the chain from dragging
  // when this is the second attempt.
  //
  // Model choice came from asking the API rather than the docs. The obvious
  // candidate, llama-3.3-70b-versatile, is not served on this account at all,
  // which `npm run ai:models` caught immediately.
  groq: { model: "openai/gpt-oss-120b", timeoutMs: 20_000 },
};

function keyFor(p: ProviderName): string | undefined {
  const key = p === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

function modelFor(p: ProviderName): string {
  const env = p === "gemini" ? process.env.GEMINI_MODEL : process.env.GROQ_MODEL;
  return env?.trim() || DEFAULTS[p].model;
}

export function configuredProviders(): ProviderName[] {
  const raw = process.env.AI_PROVIDER_ORDER?.trim();
  const order: ProviderName[] = raw
    ? (raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is ProviderName => s === "gemini" || s === "groq"))
    : ["gemini", "groq"];

  // De-duplicate while preserving the stated order, then drop anything with
  // no key so the chain only contains providers that can actually be tried.
  return [...new Set(order)].filter((p) => Boolean(keyFor(p)));
}

/** True when at least one provider has a key. */
export function aiEnabled(): boolean {
  return configuredProviders().length > 0;
}

/** For the health endpoint and the UI, so it is obvious what is wired up. */
export function aiStatus() {
  const available = configuredProviders();
  return {
    enabled: available.length > 0,
    providers: available.map((p) => ({ provider: p, model: modelFor(p) })),
    order: available,
  };
}

/**
 * Pull the human-readable bit out of a provider error body.
 *
 * Both providers return JSON with the useful sentence buried inside, and both
 * of those bodies are several hundred characters of envelope. Dumping the raw
 * payload into the UI tells a manager nothing, so the message is extracted
 * and the rest discarded.
 */
function readableError(status: number, body: string): string {
  try {
    const j = JSON.parse(body);
    const msg = j?.error?.message ?? j?.message;
    if (typeof msg === "string" && msg.trim()) {
      return `HTTP ${status}: ${msg.trim().slice(0, 200)}`;
    }
  } catch {
    // Not JSON. Fall through to the truncated body.
  }
  const flat = body.replace(/\s+/g, " ").trim();
  return flat ? `HTTP ${status}: ${flat.slice(0, 160)}` : `HTTP ${status}`;
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function callGemini(req: Request, signal: AbortSignal): Promise<string> {
  const key = keyFor("gemini")!;
  const model = modelFor("gemini");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? 0,
          // Generous, because this model spends output budget reasoning before
          // it writes. A tight cap truncated JSON mid-object.
          maxOutputTokens: req.maxOutputTokens ?? 8192,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(readableError(res.status, await res.text().catch(() => "")));
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finish = json?.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`No text returned (finishReason: ${finish}).`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Groq
//
// OpenAI-compatible, so this is a chat-completions call. Using the REST API
// directly rather than the OpenAI SDK keeps the dependency list honest -- it
// is one endpoint.
// ---------------------------------------------------------------------------

async function callGroq(req: Request, signal: AbortSignal): Promise<string> {
  const key = keyFor("groq")!;
  const model = modelFor("groq");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: req.temperature ?? 0,
      max_tokens: req.maxOutputTokens ?? 4096,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(readableError(res.status, await res.text().catch(() => "")));
  }

  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) {
    const finish = json?.choices?.[0]?.finish_reason ?? "unknown";
    throw new Error(`No text returned (finish_reason: ${finish}).`);
  }
  return text;
}

const CALLERS: Record<ProviderName, (r: Request, s: AbortSignal) => Promise<string>> = {
  gemini: callGemini,
  groq: callGroq,
};

// ---------------------------------------------------------------------------
// The fallback chain
// ---------------------------------------------------------------------------

/**
 * Try each configured provider in order, return the first success.
 *
 * Every attempt is recorded, including failures, so the UI can say which
 * provider answered and the logs show why the first one did not. Silently
 * falling back would hide a provider that is permanently broken.
 */
export async function generateText(req: Request): Promise<TextResult> {
  const chain = configuredProviders();
  const attempts: Attempt[] = [];

  if (chain.length === 0) {
    return {
      ok: false,
      reason: "disabled",
      message:
        "No AI provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY to enable this.",
      attempts,
    };
  }

  for (const provider of chain) {
    const model = modelFor(provider);
    const budget = req.timeoutMs ?? DEFAULTS[provider].timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    const started = Date.now();

    try {
      const text = await CALLERS[provider](req, controller.signal);
      const ms = Date.now() - started;
      attempts.push({ provider, model, ok: true, ms });
      return { ok: true, text, provider, model, ms, attempts };
    } catch (err) {
      const ms = Date.now() - started;
      const aborted = err instanceof Error && err.name === "AbortError";
      const error = aborted
        ? `Timed out after ${budget}ms.`
        : err instanceof Error
          ? err.message
          : "Unknown error.";
      attempts.push({ provider, model, ok: false, ms, error });

      // Logged rather than swallowed: a provider that always fails should be
      // visible in the server output, not just quietly skipped.
      console.warn(`[ai] ${provider} (${model}) failed after ${ms}ms: ${error}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const summary = attempts
    .map((a) => `${a.provider} (${a.model}): ${a.error}`)
    .join(" | ");

  return {
    ok: false,
    reason: "error",
    message:
      chain.length === 1
        ? `The ${chain[0]} request failed. ${attempts[0]?.error ?? ""}`
        : `All ${chain.length} providers failed. ${summary}`,
    attempts,
  };
}

export type JsonResult<T> =
  | { ok: true; data: T; provider: ProviderName; model: string; ms: number; attempts: Attempt[] }
  | {
      ok: false;
      reason: "disabled" | "error" | "unparseable";
      message: string;
      attempts: Attempt[];
      raw?: string;
    };

/**
 * Ask for JSON and validate it.
 *
 * A reply that parses but has the wrong shape is treated as a failure of that
 * provider, so the chain moves on rather than giving up -- a malformed answer
 * from the first provider should not deny the second a turn.
 */
export async function generateJson<T>(
  req: Request & { validate: (value: unknown) => T | null }
): Promise<JsonResult<T>> {
  const chain = configuredProviders();
  const attempts: Attempt[] = [];

  if (chain.length === 0) {
    return {
      ok: false,
      reason: "disabled",
      message:
        "No AI provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY to enable this.",
      attempts,
    };
  }

  let lastRaw: string | undefined;

  for (const provider of chain) {
    const model = modelFor(provider);
    const budget = req.timeoutMs ?? DEFAULTS[provider].timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    const started = Date.now();

    try {
      const text = await CALLERS[provider]({ ...req, json: true }, controller.signal);
      lastRaw = text;

      // Models wrap JSON in a code fence even when told not to.
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

      const parsed = JSON.parse(cleaned) as unknown;
      const validated = req.validate(parsed);
      if (validated === null) throw new Error("JSON did not match the expected shape.");

      const ms = Date.now() - started;
      attempts.push({ provider, model, ok: true, ms });
      return { ok: true, data: validated, provider, model, ms, attempts };
    } catch (err) {
      const ms = Date.now() - started;
      const aborted = err instanceof Error && err.name === "AbortError";
      const error = aborted
        ? `Timed out after ${budget}ms.`
        : err instanceof SyntaxError
          ? "Reply was not valid JSON."
          : err instanceof Error
            ? err.message
            : "Unknown error.";
      attempts.push({ provider, model, ok: false, ms, error });
      console.warn(`[ai] ${provider} (${model}) failed after ${ms}ms: ${error}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    reason: attempts.some((a) => a.error?.includes("JSON")) ? "unparseable" : "error",
    message:
      chain.length === 1
        ? `The ${chain[0]} request failed. ${attempts[0]?.error ?? ""}`
        : `All ${chain.length} providers failed. ` +
          attempts.map((a) => `${a.provider}: ${a.error}`).join(" | "),
    attempts,
    raw: lastRaw,
  };
}

/**
 * List the models a provider will actually serve.
 *
 * Added because a retired Gemini model cost real debugging time, and the
 * API's own error message named a replacement that does not exist. Asking the
 * provider is the only reliable way to know.
 *
 *   npm run ai:models
 */
export async function listModels(
  provider: ProviderName
): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  const key = keyFor(provider);
  if (!key) return { ok: false, message: `No API key set for ${provider}.` };

  try {
    const res =
      provider === "gemini"
        ? await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`,
            { signal: AbortSignal.timeout(20_000) }
          )
        : await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(20_000),
          });

    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const json = await res.json();

    const models: string[] =
      provider === "gemini"
        ? (json.models ?? [])
            .filter((m: { supportedGenerationMethods?: string[] }) =>
              m.supportedGenerationMethods?.includes("generateContent")
            )
            .map((m: { name: string }) => m.name.replace("models/", ""))
        : (json.data ?? []).map((m: { id: string }) => m.id);

    return { ok: true, models: models.sort() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}
