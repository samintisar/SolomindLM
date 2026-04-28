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
  | "google";

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
    id: "moonshotai/Kimi-K2.6",
    name: "Moonshot Kimi K2.6",
    description: "Advanced reasoning with thinking chains",
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
    id: "MiniMaxAI/MiniMax-M2.7",
    name: "MiniMax M2.7",
    description: "High-performance multimodal model",
    brand: "minimax",
  },
  {
    id: "google/gemma-4-31B-it",
    name: "Gemma 4 31B",
    description: "Google's efficient instruction-tuned model",
    brand: "google",
  },
];

export type SmartModelId = typeof AVAILABLE_SMART_MODELS[number]["id"];

/**
 * Find a model by its ID.
 */
export function findSmartModelById(id: string | undefined): SmartModel | undefined {
  return AVAILABLE_SMART_MODELS.find((model) => model.id === id);
}
