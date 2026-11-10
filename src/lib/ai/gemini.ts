/**
 * Kept as a thin re-export.
 *
 * Model access now goes through providers.ts, which tries Gemini and then
 * Groq. This file exists so callers that only ever wanted "ask a model
 * something" do not have to care which one answered.
 */

export {
  aiEnabled,
  aiStatus,
  configuredProviders,
  generateJson,
  generateText,
  listModels,
} from "./providers";

export type { Attempt, JsonResult, ProviderName, Request, TextResult } from "./providers";
