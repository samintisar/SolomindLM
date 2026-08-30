import { DEFAULT_SMART_MODEL_ID } from "./defaultSmartModel.js";

/**
 * Available smart model IDs for RAG chat and literature review.
 * Keep in sync with AVAILABLE_SMART_MODELS in apps/web/src/shared/constants/models.ts
 */
export const AVAILABLE_SMART_MODEL_IDS = [
  DEFAULT_SMART_MODEL_ID,
  "openai/gpt-oss-120b",
  "MiniMaxAI/MiniMax-M3",
  "google/gemma-4-31B-it",
  "Qwen/Qwen3.7-Max",
  "zai-org/GLM-5.3-Flash",
] as const;

export type SmartModelId = (typeof AVAILABLE_SMART_MODEL_IDS)[number];

export { DEFAULT_SMART_MODEL_ID };

/** Validate notebook/chat model selection; fall back to DeepSeek V4 Flash. */
export function resolveSmartModel(candidate?: string | null): SmartModelId {
  const validModelIds = new Set<string>(AVAILABLE_SMART_MODEL_IDS);
  if (candidate && validModelIds.has(candidate)) {
    return candidate as SmartModelId;
  }
  return DEFAULT_SMART_MODEL_ID;
}
