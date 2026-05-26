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

/**
 * Result from createLLMs factory function.
 */
export interface LLMInstances {
  /** Fast LLM for map phase (parallel processing) */
  fastLlm: ChatTogetherAI;
  /** Smart LLM for reduce phase (quality synthesis) */
  smartLlm: ChatTogetherAI;
}

// ============================================================
// Together model kwargs
// ============================================================

/** Map = fast extraction; smart = reduce / synthesis (medium reasoning on GPT-OSS). */
export type TogetherModelPhase = "fast" | "smart";

/**
 * Kwargs for Together chat/completions: GPT-OSS uses `reasoning_effort`; hybrid
 * Qwen / DeepSeek-style models use `chat_template_kwargs.thinking`.
 * `chat_template_kwargs` is not applied to `openai/*` (ignored for GPT-OSS).
 *
 * GPT-OSS: fast → `low`, smart → `medium` (Together’s balanced default).
 *
 * @see .agents/skills/together-chat-completions/references/reasoning-models.md
 */
export function mergeModelKwargs(
  model: string,
  phase: TogetherModelPhase
): Record<string, unknown> {
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
 * Creates LLM instances for map and reduce phases with consistent configuration.
 *
 * If reduceModel is not provided, fastLlm will be used for both phases.
 *
 * @param config - LLM configuration
 * @returns Object containing fastLlm and smartLlm instances
 *
 * @example
 * ```typescript
 * // With separate map and reduce models
 * const llms = createLLMs({
 *   apiKey: env.TOGETHER_AI_API_KEY,
 *   mapModel: 'meta-llama/Llama-3-70b-chat-hf',
 *   reduceModel: 'meta-llama/Llama-3-70b-chat-hf',
 *   temperatures: {
 *     map: 0.3,
 *     reduce: 0.6,
 *   },
 * });
 *
 * // With single model for both phases
 * const llms = createLLMs({
 *   apiKey: env.TOGETHER_AI_API_KEY,
 *   mapModel: 'meta-llama/Llama-3-70b-chat-hf',
 * });
 * ```
 */
export function createLLMs(config: LLMConfig): LLMInstances {
  const fastModelKwargs = mergeModelKwargs(config.mapModel, "fast");
  const reduceModelKwargs = config.reduceModel ? mergeModelKwargs(config.reduceModel, "smart") : {};

  // Fast model for map phase (parallel processing, lower temp for consistency)
  const fastLlm = new ChatTogetherAI({
    apiKey: config.apiKey,
    model: config.mapModel,
    temperature: config.temperatures?.map ?? 0.3,
    maxTokens: config.maxTokens?.map,
    modelKwargs: fastModelKwargs,
  });

  // Smart model for reduce phase (quality synthesis, higher temp for creativity)
  const smartLlm = config.reduceModel
    ? new ChatTogetherAI({
        apiKey: config.apiKey,
        model: config.reduceModel,
        temperature: config.temperatures?.reduce ?? 0.6,
        maxTokens: config.maxTokens?.reduce,
        modelKwargs: reduceModelKwargs,
      })
    : fastLlm;

  return { fastLlm, smartLlm };
}

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
 *   mapModel: 'meta-llama/Llama-3-70b-chat-hf',
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

/**
 * Creates LLM instances from environment variables.
 *
 * This is a convenience function that reads from standard env variable names.
 *
 * @param env - Environment variables object
 * @returns Object containing fastLlm and smartLlm instances
 *
 * @example
 * ```typescript
 * import { env } from '../../_lib/env';
 *
 * const llms = createLLMsFromEnv(env, {
 *   mapModel: env.FAST_LLM,
 *   reduceModel: env.SMART_LLM,
 * });
 * ```
 */
export function createLLMsFromEnv(
  env: Record<string, string | undefined>,
  options: {
    mapModel?: string;
    reduceModel?: string;
    mapTemperature?: number;
    reduceTemperature?: number;
  } = {}
): LLMInstances {
  const apiKey = options.mapModel && env.TOGETHER_AI_API_KEY;

  if (!apiKey) {
    throw new Error("TOGETHER_AI_API_KEY is required");
  }

  return createLLMs({
    apiKey,
    mapModel: options.mapModel || env.FAST_LLM || "gpt-oss-20b",
    reduceModel: options.reduceModel || env.SMART_LLM,
    temperatures: {
      map: options.mapTemperature,
      reduce: options.reduceTemperature,
    },
  });
}
