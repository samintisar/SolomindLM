/**
 * Available smart models for RAG chat.
 * This is the single source of truth for model options in the UI.
 */

/** Vendor for picker icons (Simple Icons–style glyphs in the UI). */
export type SmartModelBrand =
  | "openai"
  | "deepseek"
  | "minimax"
  | "moonshot"
  | "google"
  | "qwen"
  | "zai";

export interface SmartModel {
  id: string;
  name: string;
  description: string;
  /** Shown beside the model name in chat model picker */
  brand: SmartModelBrand;
  /** Served context window on Together AI (`context_length` from /v1/models). */
  contextWindowTokens: number;
}

/** Default RAG chat model when the notebook has no saved selection. */
export const DEFAULT_SMART_MODEL_ID = "deepseek-ai/DeepSeek-V4.1-Flash";

export const AVAILABLE_SMART_MODELS: SmartModel[] = [
  {
    id: DEFAULT_SMART_MODEL_ID,
    name: "DeepSeek V4.1 Flash",
    description: "Fast reasoning and synthesis",
    brand: "deepseek",
    contextWindowTokens: 1_048_576,
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    description: "Fast, reliable general-purpose model",
    brand: "openai",
    contextWindowTokens: 131_072,
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    name: "MiniMax M3",
    description: "Native multimodal model with 1M context",
    brand: "minimax",
    contextWindowTokens: 524_288,
  },
  {
    id: "google/gemma-4-31B-it",
    name: "Gemma 4 31B",
    description: "Google's efficient instruction-tuned model",
    brand: "google",
    contextWindowTokens: 262_144,
  },
  {
    id: "Qwen/Qwen3.8-Flash",
    name: "Qwen3.8 Flash",
    description: "Hybrid reasoning model with 1M context",
    brand: "qwen",
    contextWindowTokens: 1_000_000,
  },
  {
    id: "zai-org/GLM-5.3-Flash",
    name: "GLM 5.3 Flash",
    description: "Fast GLM reasoning for coding and agentic tasks",
    brand: "zai",
    contextWindowTokens: 1_048_575,
  },
];

export type SmartModelId = (typeof AVAILABLE_SMART_MODELS)[number]["id"];

/**
 * Find a model by its ID.
 */
export function findSmartModelById(id: string | undefined): SmartModel | undefined {
  return AVAILABLE_SMART_MODELS.find((model) => model.id === id);
}
