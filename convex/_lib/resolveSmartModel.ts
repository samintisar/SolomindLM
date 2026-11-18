import { env } from "./env.js";

/**
 * Available smart model IDs for RAG chat and literature review.
 * Keep in sync with AVAILABLE_SMART_MODELS in apps/web/src/shared/constants/models.ts
 */
export const AVAILABLE_SMART_MODEL_IDS = [
  "openai/gpt-oss-120b",
  "deepseek-ai/DeepSeek-V4-Flash-0731",
  "MiniMaxAI/MiniMax-M3",
  "google/gemma-4-31B-it",
  "Qwen/Qwen3.7-Plus",
] as const;

export type SmartModelId = (typeof AVAILABLE_SMART_MODEL_IDS)[number];

/** Retired picker IDs that should keep using the replacement model. */
const SMART_MODEL_ALIASES: Record<string, SmartModelId> = {
  "Qwen/Qwen3.7-Max": "Qwen/Qwen3.7-Plus",
};

/** Validate notebook/chat model selection; fall back to env default. */
export function resolveSmartModel(candidate?: string | null): SmartModelId {
  const mapped = candidate ? (SMART_MODEL_ALIASES[candidate] ?? candidate) : candidate;
  const validModelIds = new Set<string>(AVAILABLE_SMART_MODEL_IDS);
  if (mapped && validModelIds.has(mapped)) {
    return mapped as SmartModelId;
  }
  return (env.SMART_LLM ?? "openai/gpt-oss-120b") as SmartModelId;
}
