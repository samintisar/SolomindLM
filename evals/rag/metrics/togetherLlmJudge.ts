/**
 * Together AI invoker for LLM judge metrics.
 *
 * Uses Together AI SDK directly.
 * Designed for eval scripts running outside of Convex.
 */

import Together from "together-ai";
import type { LlmJudgeOptions } from "./llmJudge";
import { DEFAULT_LLM_JUDGE_MODEL } from "./llmJudge";

// ============================================================
// Configuration
// ============================================================

export interface TogetherJudgeConfig {
  /** Together AI API key (reads from TOGETHER_AI_API_KEY env var by default) */
  apiKey?: string;
  /** Model to use for judging (default: deepseek-ai/DeepSeek-V4.1-Flash) */
  model?: string;
  /** Base URL (defaults to Together AI) */
  baseURL?: string;
  /** Maximum tokens for judge response, reasoning included (default: 8192) */
  maxTokens?: number;
  /** Temperature for judge (default: 0.1 for consistent evaluation) */
  temperature?: number;
}

/** Default judge model for eval binary judges and pairwise compare */
const DEFAULT_JUDGE_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash";

/** Cheaper alternative for quick iterations */
const FAST_JUDGE_MODEL = "meta-llama/Llama-3.3-8B-Instruct-Turbo";

/** Alternative premium judge */
const PREMIUM_JUDGE_MODEL = "Qwen/Qwen2.5-72B-Instruct-Turbo";

// ============================================================
// Client Factory
// ============================================================

/**
 * Create a Together AI client for judge operations.
 */
export function createTogetherClient(config: TogetherJudgeConfig = {}): Together {
  const apiKey = config.apiKey ?? process.env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TOGETHER_AI_API_KEY not found. Set it in environment or pass via config.apiKey"
    );
  }

  return new Together({
    apiKey,
    baseURL: config.baseURL ?? "https://api.together.xyz/v1",
  });
}

// ============================================================
// Judge Invoker
// ============================================================

/** Returns `text` if it parses as a JSON object (not null or an array), else null. */
function parseJsonObject(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? text : null;
  } catch {
    return null;
  }
}

/** Index of the `}` closing the `{` at `start`, skipping braces inside JSON strings, or -1. */
function matchObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}" && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Returns `text` if it is a JSON object. With `allowEmbedded`, otherwise returns the last outermost
 * `{...}` object inside it (a verdict that follows reasoning prose). Else null.
 */
function extractJsonVerdict(text: string, allowEmbedded: boolean): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const bare = parseJsonObject(trimmed);
  if (bare || !allowEmbedded) return bare;
  let verdict: string | null = null;
  for (let start = trimmed.indexOf("{"); start >= 0; ) {
    const end = matchObjectEnd(trimmed, start);
    const candidate = end >= 0 ? parseJsonObject(trimmed.slice(start, end + 1)) : null;
    if (candidate) verdict = candidate;
    // Skip past a parsed object so its nested objects are never taken as the verdict.
    start = trimmed.indexOf("{", candidate ? end + 1 : start + 1);
  }
  return verdict;
}

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
  // Reasoning judges (the default) spend most of the budget thinking; 1024 truncated long judge
  // prompts before the verdict.
  const maxTokens = config.maxTokens ?? 8192;
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

      const choice = response.choices[0];
      const message = choice?.message as
        | { content?: string | null; reasoning?: string; reasoning_content?: string }
        | undefined;
      // Reasoning judges can put their scratch work in `content` (json_object mode) or in a
      // reasoning field, so take the JSON verdict from whichever field carries one. Scratch work
      // can hold draft verdicts, so a verdict after prose only counts in the content of a reply
      // that finished; reasoning fields and cut-off replies must be bare JSON.
      const finished = choice?.finish_reason !== "length";
      const fields: Array<[string | null | undefined, boolean]> = [
        [message?.content, finished],
        [message?.reasoning, false],
        [message?.reasoning_content, false],
      ];
      for (const [field, allowEmbedded] of fields) {
        const verdict = field ? extractJsonVerdict(field, allowEmbedded) : null;
        if (verdict) return verdict;
      }
      throw new Error(
        `LLM judge returned no JSON verdict (finish_reason=${choice?.finish_reason ?? "unknown"})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Together AI judge failed: ${message}`, { cause: err });
    }
  };
}

// ============================================================
// Preset Configurations
// ============================================================

export const JUDGE_PRESETS: Record<string, TogetherJudgeConfig> = {
  /** Default: DeepSeek V4.1 Flash for eval judges */
  default: {
    model: DEFAULT_JUDGE_MODEL,
    temperature: 0.1,
    maxTokens: 8192,
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

  /** GPT-OSS 120B: legacy Likert judges */
  gptOss120b: {
    model: "openai/gpt-oss-120b",
    temperature: 0.1,
    maxTokens: 8192,
  },

  /** Qwen 3.5 9B: fast alternative */
  qwen35_9b: {
    model: DEFAULT_LLM_JUDGE_MODEL,
    temperature: 0.1,
    maxTokens: 8192,
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
  fixturesAndArtifacts: Array<{
    fixture: import("../types").EvalFixture;
    artifact: import("../types").EvalRunArtifact;
  }>,
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
