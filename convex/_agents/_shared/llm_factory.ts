"use node";
/**
 * LLM factory for agent operations.
 *
 * Provides factory functions for creating LLM instances with consistent
 * configuration across all agents.
 *
 * This eliminates the need for each agent to duplicate LLM initialization
 * logic and provides a single source of truth for LLM configuration.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";

// Convex action runtime may lack performance; LangChain SDK expects performance.now().
if (typeof globalThis.performance === "undefined") {
  (globalThis as unknown as Record<string, unknown>).performance = {
    now: () => Date.now(),
    timeOrigin: Date.now(),
  };
}

// ============================================================
// Types
// ============================================================

/**
 * Configuration for creating LLM instances.
 */
export interface LLMConfig {
  /** TogetherAI API key */
  apiKey: string;
  /** Model name for map phase (fast, high-throughput processing) */
  mapModel: string;
  /** Model name for reduce phase (smart, high-quality synthesis) */
  reduceModel?: string;
  /** Temperature settings for map and reduce phases */
  temperatures?: {
    /** Temperature for map phase (default: 0.3 for factual extraction) */
    map?: number;
    /** Temperature for reduce phase (default: 0.6 for creative synthesis) */
    reduce?: number;
  };
  /** Max tokens settings for map and reduce phases */
  maxTokens?: {
    /** Max tokens for map phase */
    map?: number;
    /** Max tokens for reduce phase */
    reduce?: number;
  };
}

// ============================================================
// Together model kwargs
// ============================================================

/** Map = fast extraction; smart = reduce / synthesis (medium reasoning on GPT-OSS). */
export type TogetherModelPhase = "fast" | "smart";

/**
 * Kwargs for Together chat/completions: GPT-OSS uses `reasoning_effort`; Qwen
 * models use `reasoning.enabled`; other hybrid models use
 * `chat_template_kwargs.thinking`. `chat_template_kwargs` is not applied to
 * `openai/*` (ignored for GPT-OSS).
 *
 * GPT-OSS: fast → `low`, smart → `medium` (Together’s balanced default).
 * Qwen 3.5 9B is always non-reasoning; Qwen 3.8 Flash reasons only in smart
 * phase requests, which is used by the chat model picker.
 *
 * @see .agents/skills/together-chat-completions/references/reasoning-models.md
 */
export function mergeModelKwargs(
  model: string,
  phase: TogetherModelPhase
): Record<string, unknown> {
  if (model === "Qwen/Qwen3.5-9B") {
    return { reasoning: { enabled: false } };
  }
  if (model === "Qwen/Qwen3.8-Flash") {
    return { reasoning: { enabled: phase === "smart" } };
  }
  if (model.startsWith("openai/gpt-oss-")) {
    return { reasoning_effort: phase === "fast" ? "low" : "medium" };
  }
  if (model.startsWith("openai/")) {
    return {};
  }
  return {
    chat_template_kwargs: { thinking: phase === "smart" },
  };
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Creates a single LLM instance with specified configuration.
 *
 * Use this for agents that don't need separate map/reduce models.
 *
 * @param config - LLM configuration (only uses mapModel, temperatures.map, maxTokens.map)
 * @returns A ChatTogetherAI instance
 *
 * @example
 * ```typescript
 * const llm = createLLM({
 *   apiKey: env.TOGETHER_AI_API_KEY,
 *   mapModel: 'Qwen/Qwen3.5-9B',
 *   temperatures: { map: 0.1 },
 * });
 * ```
 */
export function createLLM(
  config: Omit<LLMConfig, "reduceModel" | "temperatures" | "maxTokens"> & {
    temperatures?: number;
    maxTokens?: number;
    /** Default `fast` when omitted. */
    phase?: TogetherModelPhase;
  }
): ChatTogetherAI {
  const modelKwargs = mergeModelKwargs(config.mapModel, config.phase ?? "fast");

  return new ChatTogetherAI({
    apiKey: config.apiKey,
    model: config.mapModel,
    temperature: config.temperatures ?? 0.3,
    maxTokens: config.maxTokens,
    modelKwargs,
  });
}
