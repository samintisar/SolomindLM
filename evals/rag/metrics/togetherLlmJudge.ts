/**
 * Together AI invoker for LLM judge metrics.
 *
 * Uses OpenAI-compatible SDK with Together AI endpoints.
 * Designed for eval scripts running outside of Convex.
 */

import OpenAI from "openai";
import type { LlmJudgeOptions } from "./llmJudge";

// ============================================================
// Configuration
// ============================================================

export interface TogetherJudgeConfig {
  /** Together AI API key (reads from TOGETHER_AI_API_KEY env var by default) */
  apiKey?: string;
  /** Model to use for judging (default: meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo) */
  model?: string;
  /** Base URL (defaults to Together AI) */
  baseURL?: string;
  /** Maximum tokens for judge response (default: 1024) */
  maxTokens?: number;
  /** Temperature for judge (default: 0.1 for consistent evaluation) */
  temperature?: number;
}

/** Default judge model: project's smart model for high-quality evaluation */
const DEFAULT_JUDGE_MODEL = "openai/gpt-oss-120b";

/** Cheaper alternative for quick iterations */
const FAST_JUDGE_MODEL = "meta-llama/Llama-3.3-8B-Instruct-Turbo";

/** Alternative premium judge */
const PREMIUM_JUDGE_MODEL = "Qwen/Qwen2.5-72B-Instruct-Turbo";

// ============================================================
// Client Factory
// ============================================================

/**
 * Create an OpenAI client configured for Together AI.
 */
export function createTogetherClient(config: TogetherJudgeConfig = {}): OpenAI {
  const apiKey = config.apiKey ?? process.env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TOGETHER_AI_API_KEY not found. Set it in environment or pass via config.apiKey"
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: config.baseURL ?? "https://api.together.xyz/v1",
  });
}

// ============================================================
// Judge Invoker
// ============================================================

/**
 * Create an LLM judge invoker function for use with eval metrics.
 *
 * @example
 * ```typescript
 * import { scoreAllLlmJudgeMetrics } from "./metrics";
 * import { createTogetherJudgeInvoker } from "./metrics/togetherLlmJudge";
 *
 * const invoker = createTogetherJudgeInvoker({ model: DEFAULT_JUDGE_MODEL });
 * const results = await scoreAllLlmJudgeMetrics(fixture, artifact, {
 *   invoke: invoker,
 * });
 * ```
 */
export function createTogetherJudgeInvoker(
  config: TogetherJudgeConfig = {}
): LlmJudgeOptions["invoke"] {
  const client = createTogetherClient(config);
  const model = config.model ?? DEFAULT_JUDGE_MODEL;
  const maxTokens = config.maxTokens ?? 1024;
  const temperature = config.temperature ?? 0.1;

  return async (prompt: string): Promise<string> => {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert RAG evaluator. Respond only with valid JSON. " +
              "Do not include markdown code blocks or additional text.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from LLM judge");
      }

      return content;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Together AI judge failed: ${message}`);
    }
  };
}

// ============================================================
// Preset Configurations
// ============================================================

export const JUDGE_PRESETS: Record<string, TogetherJudgeConfig> = {
  /** Default: GPT-OSS 120B for high-quality evaluation */
  default: {
    model: DEFAULT_JUDGE_MODEL,
    temperature: 0.1,
    maxTokens: 1024,
  },

  /** Fast: for quick iterations during development */
  fast: {
    model: FAST_JUDGE_MODEL,
    temperature: 0.1,
    maxTokens: 512,
  },

  /** Premium: alternative high-quality judge */
  premium: {
    model: PREMIUM_JUDGE_MODEL,
    temperature: 0.0,
    maxTokens: 2048,
  },

  /** GPT-OSS 20B: faster alternative for quick iterations */
  gptOss20b: {
    model: "openai/gpt-oss-20b",
    temperature: 0.1,
    maxTokens: 1024,
  },
};

/**
 * Get a preset invoker by name.
 */
export function getPresetInvoker(
  preset: keyof typeof JUDGE_PRESETS = "default"
): ReturnType<typeof createTogetherJudgeInvoker> {
  return createTogetherJudgeInvoker(JUDGE_PRESETS[preset]);
}

// ============================================================
// Batch Evaluation Helper
// ============================================================

/**
 * Evaluate multiple fixtures in parallel using the LLM judge.
 *
 * @param fixturesAndArtifacts - Pairs of fixtures and their artifacts
 * @param config - Together judge configuration
 * @returns Array of metric results for all fixtures
 */
export async function batchEvaluateWithLlmJudge(
  fixturesAndArtifacts: Array<{ fixture: import("../types").EvalFixture; artifact: import("../types").EvalRunArtifact }>,
  config: TogetherJudgeConfig = {}
): Promise<import("../types").MetricResult[]> {
  const { scoreAllLlmJudgeMetrics } = await import("./llmJudge");
  const invoker = createTogetherJudgeInvoker(config);

  // Run all evaluations in parallel (with concurrency limit could be added)
  const allResults = await Promise.all(
    fixturesAndArtifacts.map(({ fixture, artifact }) =>
      scoreAllLlmJudgeMetrics(fixture, artifact, { invoke: invoker })
    )
  );

  return allResults.flat();
}

// ============================================================
// CLI Helper
// ============================================================

/**
 * Parse CLI arguments for judge configuration.
 * Supports: --judge-model, --judge-preset, --together-key
 */
export function parseJudgeArgs(args: string[] = process.argv.slice(2)): TogetherJudgeConfig {
  const config: TogetherJudgeConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--judge-model":
      case "-m":
        if (next) config.model = next;
        break;
      case "--judge-preset":
      case "-p":
        if (next && next in JUDGE_PRESETS) {
          Object.assign(config, JUDGE_PRESETS[next as keyof typeof JUDGE_PRESETS]);
        }
        break;
      case "--together-key":
      case "-k":
        if (next) config.apiKey = next;
        break;
    }
  }

  return config;
}

// Export model constants for convenience
export { DEFAULT_JUDGE_MODEL, FAST_JUDGE_MODEL, PREMIUM_JUDGE_MODEL };
