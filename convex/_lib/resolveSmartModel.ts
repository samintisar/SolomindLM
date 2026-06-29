import { env } from "./env.js";

/**
 * Available smart model IDs for RAG chat and literature review.
 * Keep in sync with AVAILABLE_SMART_MODELS in apps/web/src/shared/constants/models.ts
 */
export const AVAILABLE_SMART_MODEL_IDS = [
  "openai/gpt-oss-120b",
  "moonshotai/Kimi-K2.7-Code",
  "deepseek-ai/DeepSeek-V4-Pro",
  "MiniMaxAI/MiniMax-M3",
  "google/gemma-4-31B-it",
  "Qwen/Qwen3.7-Max",
  "zai-org/GLM-5.2",
] as const;

export type SmartModelId = (typeof AVAILABLE_SMART_MODEL_IDS)[number];

/** Validate notebook/chat model selection; fall back to env default. */
export function resolveSmartModel(candidate?: string | null): SmartModelId {
  const validModelIds = new Set(AVAILABLE_SMART_MODEL_IDS);
  if (candidate && validModelIds.has(candidate as SmartModelId)) {
    return candidate as SmartModelId;
  }
  return (env.SMART_LLM ?? "openai/gpt-oss-120b") as SmartModelId;
}
