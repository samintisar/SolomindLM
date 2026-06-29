/**
 * Available smart models for RAG chat.
 * This is the single source of truth for model options in the UI.
 */

/** Vendor for picker icons (Simple Icons–style glyphs in the UI). */
export type SmartModelBrand =
  | "openai"
  | "moonshot"
  | "deepseek"
  | "minimax"
  | "google"
  | "qwen"
  | "zai";

export interface SmartModel {
  id: string;
  name: string;
  description: string;
  /** Shown beside the model name in chat model picker */
  brand: SmartModelBrand;
  isThinkingModel?: boolean;
}

export const AVAILABLE_SMART_MODELS: SmartModel[] = [
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    description: "Fast, reliable general-purpose model",
    brand: "openai",
  },
  {
    id: "moonshotai/Kimi-K2.7-Code",
    name: "Kimi K2.7 Code",
    description: "Coding-focused agentic model with thinking mode",
    brand: "moonshot",
    isThinkingModel: true,
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Pro",
    name: "DeepSeek V4-Pro",
    description: "High-quality reasoning and synthesis",
    brand: "deepseek",
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    name: "MiniMax M3",
    description: "Native multimodal model with 1M context",
    brand: "minimax",
  },
  {
    id: "google/gemma-4-31B-it",
    name: "Gemma 4 31B",
    description: "Google's efficient instruction-tuned model",
    brand: "google",
  },
  {
    id: "Qwen/Qwen3.7-Max",
    name: "Qwen3.7 Max",
    description: "Latest Qwen flagship with very long context",
    brand: "qwen",
  },
  {
    id: "zai-org/GLM-5.2",
    name: "GLM 5.2",
    description: "Long-horizon coding and agentic tasks with 1M context",
    brand: "zai",
  },
];

export type SmartModelId = (typeof AVAILABLE_SMART_MODELS)[number]["id"];

/**
 * Find a model by its ID.
 */
export function findSmartModelById(id: string | undefined): SmartModel | undefined {
  return AVAILABLE_SMART_MODELS.find((model) => model.id === id);
}
