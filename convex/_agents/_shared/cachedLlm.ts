"use node";

/**
 * Cached LLM Service
 *
 * Provides caching for deterministic LLM calls (temperature=0).
 * Non-deterministic calls bypass cache and go directly to the LLM.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { env } from "../../_lib/env";
import { CACHE_TTL, withJitter } from "../../_services/cache/cache";
import { hashInput } from "../../_services/cache/cacheCrypto";
import { createCachedAction } from "../../_services/cache/cachedAgent";
import { mergeModelKwargs } from "./llm_factory.js";

// ============================================================
// Types
// ============================================================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  model: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens?: number;
  responseFormat?:
    | { type: "text" | "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          schema: Record<string, unknown>;
        };
      };
  /**
   * When false: `mergeModelKwargs(model, "fast")` (GPT-OSS: reasoning_effort low; Qwen: thinking off).
   * When true: `mergeModelKwargs(model, "smart")` (GPT-OSS: reasoning_effort medium; Qwen: thinking on).
   */
  reasoningEnabled?: boolean;
  /**
   * OpenAI-style. `"none"` prevents spurious tool_calls when no tools are provided.
   */
  toolChoice?: "none" | "auto" | "required";
}

export interface LLMResponse {
  content: string;
  /** Populated for `json_schema` / `json_object` calls when a JSON object is found in content or reasoning. */
  structuredJson?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Minimal Together / OpenAI chat completion choice shape (avoids `any` at parse boundaries). */
export type TogetherChatMessage = {
  content?: unknown;
  reasoning?: unknown;
  refusal?: unknown;
};

export type TogetherCompletionChoice = {
  message?: TogetherChatMessage;
  /** Legacy completions-style field on some Together responses */
  text?: string;
  finish_reason?: string;
};

type TogetherChatCompletionBody = {
  choices?: TogetherCompletionChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/** Normalize OpenAI-style message.content (string or multimodal parts) to plain text. */
function messageContentToString(message: { content?: unknown } | undefined): string {
  const c = message?.content;
  if (c == null) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * Extract a JSON object string from assistant text (fenced block or outermost `{...}`).
 * Returns null when no valid JSON object is found (e.g. reasoning monologue only).
 */
export function extractJsonObjectString(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates: string[] = [];
  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // try next candidate shape
    }
  }

  return null;
}

/** Prefer JSON in `content`; only use `reasoning` when it contains a parseable JSON object. */
export function togetherStructuredJsonPayload(choice: TogetherCompletionChoice | undefined): string {
  if (!choice) return "";

  const msg = choice.message;
  if (!msg) {
    const legacy = typeof choice.text === "string" ? choice.text : "";
    return extractJsonObjectString(legacy) ?? "";
  }

  const content = messageContentToString(msg);
  const fromContent = extractJsonObjectString(content);
  if (fromContent) return fromContent;

  const reasoning = (msg as { reasoning?: unknown }).reasoning;
  if (typeof reasoning === "string") {
    const fromReasoning = extractJsonObjectString(reasoning);
    if (fromReasoning) return fromReasoning;
  }

  if (typeof choice.text === "string") {
    const fromLegacy = extractJsonObjectString(choice.text);
    if (fromLegacy) return fromLegacy;
  }

  return "";
}

/**
 * Best-effort assistant text from a Together / OpenAI-style chat completion choice.
 * Some responses use legacy `text`; hybrid models may place plain output in `reasoning`.
 * For structured JSON extraction use {@link togetherStructuredJsonPayload} instead.
 */
function togetherChoiceAssistantText(choice: TogetherCompletionChoice | undefined): string {
  if (!choice) return "";
  const msg = choice.message;
  if (!msg) {
    return typeof choice.text === "string" ? choice.text : "";
  }
  const fromMessage = messageContentToString(msg);
  if (fromMessage.trim()) return fromMessage;
  if (typeof choice.text === "string" && choice.text.trim()) return choice.text;

  // FIX: Return reasoning content even if it's plain text (not just JSON)
  // Hybrid models like openai/gpt-oss-* use reasoning field for all output
  const reasoning = (msg as { reasoning?: unknown }).reasoning;
  if (typeof reasoning === "string" && reasoning.trim()) {
    return reasoning;
  }
  return "";
}

function logEmptyTogetherAssistant(model: string, choice: TogetherCompletionChoice | undefined): void {
  const msg = choice?.message;
  console.warn("[Together LLM] empty assistant text", {
    model,
    finishReason: choice?.finish_reason,
    messageKeys: msg && typeof msg === "object" ? Object.keys(msg as object) : [],
    refusal:
      msg && typeof (msg as { refusal?: unknown }).refusal === "string"
        ? (msg as { refusal: string }).refusal
        : undefined,
  });
}

/** HTTP statuses where a short backoff retry is appropriate (Together / OpenAI-style APIs). */
const TRANSIENT_LLM_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524, 529]);

function isTransientLlmHttpStatus(status: number): boolean {
  return TRANSIENT_LLM_HTTP_STATUSES.has(status);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter; capped for Convex action time limits. */
function retryDelayMs(attemptIndex: number, baseMs: number): number {
  const exp = baseMs * 2 ** attemptIndex;
  const jitter = 0.5 + Math.random();
  return Math.min(Math.floor(exp * jitter), 45_000);
}

const TOGETHER_LLM_MAX_ATTEMPTS = 5;
const TOGETHER_LLM_RETRY_BASE_MS = 900;

function togetherChatRequestBody(options: LLMOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  };
  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }
  if (options.reasoningEnabled === false) {
    Object.assign(body, mergeModelKwargs(options.model, "fast"));
  } else if (options.reasoningEnabled === true) {
    Object.assign(body, mergeModelKwargs(options.model, "smart"));
  }
  // Together marks GPT-OSS as no tool calling; omit tool_choice so the payload matches plain invokes.
  if (options.toolChoice !== undefined && !options.model.includes("openai/gpt-oss")) {
    body.tool_choice = options.toolChoice;
  }
  return body;
}

/**
 * POST chat/completions to Together with retries on transient HTTP and fetch failures.
 */
async function executeTogetherLlmRequest(
  options: LLMOptions,
  apiKey: string
): Promise<LLMResponse> {
  const url = "https://api.together.xyz/v1/chat/completions";
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(togetherChatRequestBody(options)),
  };

  let lastFailure: Error | undefined;

  for (let attempt = 0; attempt < TOGETHER_LLM_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, init);
      const bodyText = await response.text();

      if (!response.ok) {
        const err = new Error(`LLM API error: ${response.status} - ${bodyText}`);
        lastFailure = err;
        if (isTransientLlmHttpStatus(response.status) && attempt < TOGETHER_LLM_MAX_ATTEMPTS - 1) {
          await sleepMs(retryDelayMs(attempt, TOGETHER_LLM_RETRY_BASE_MS));
          continue;
        }
        throw err;
      }

      let data: TogetherChatCompletionBody;
      try {
        data = JSON.parse(bodyText) as TogetherChatCompletionBody;
      } catch {
        throw new Error("LLM API returned non-JSON body");
      }

      const choice = data.choices?.[0];
      const content = togetherChoiceAssistantText(choice);
      const wantsStructuredJson =
        options.responseFormat?.type === "json_schema" ||
        options.responseFormat?.type === "json_object";
      const structuredJson = wantsStructuredJson
        ? togetherStructuredJsonPayload(choice)
        : undefined;

      const hasStructuredJson = Boolean(structuredJson?.trim());

      if (wantsStructuredJson && !hasStructuredJson) {
        if (!content.trim()) {
          logEmptyTogetherAssistant(options.model, choice);
        }
        const msg = choice?.message;
        console.warn("[Together LLM] structured response missing JSON payload", {
          model: options.model,
          finishReason: choice?.finish_reason,
          contentPreview: messageContentToString(msg).slice(0, 120),
          reasoningPreview:
            typeof msg?.reasoning === "string" ? msg.reasoning.slice(0, 120) : undefined,
        });
        throw new Error("LLM API returned no JSON payload for structured response");
      }

      if (!content.trim() && !hasStructuredJson) {
        logEmptyTogetherAssistant(options.model, choice);
      }

      const usageRaw = data.usage;
      const usage =
        usageRaw &&
        typeof usageRaw.prompt_tokens === "number" &&
        typeof usageRaw.completion_tokens === "number" &&
        typeof usageRaw.total_tokens === "number"
          ? {
              promptTokens: usageRaw.prompt_tokens,
              completionTokens: usageRaw.completion_tokens,
              totalTokens: usageRaw.total_tokens,
            }
          : undefined;

      return {
        content,
        structuredJson,
        usage,
      };
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message === "LLM API returned non-JSON body" ||
          e.message === "LLM API returned no JSON payload for structured response")
      ) {
        throw e;
      }
      const isOurApiError = e instanceof Error && e.message.startsWith("LLM API error:");
      if (isOurApiError) {
        throw e;
      }
      lastFailure = e instanceof Error ? e : new Error(String(e));
      if (attempt < TOGETHER_LLM_MAX_ATTEMPTS - 1) {
        await sleepMs(retryDelayMs(attempt, TOGETHER_LLM_RETRY_BASE_MS));
        continue;
      }
      throw lastFailure;
    }
  }

  throw lastFailure ?? new Error("LLM request failed after retries");
}

// ============================================================
// Internal Action (makes actual API call)
// ============================================================

export const llmInternal = internalAction({
  args: {
    model: v.string(),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
      })
    ),
    temperature: v.number(),
    maxTokens: v.optional(v.number()),
    responseFormat: v.optional(
      v.union(
        v.object({ type: v.union(v.literal("text"), v.literal("json_object")) }),
        v.object({
          type: v.literal("json_schema"),
          json_schema: v.object({
            name: v.string(),
            schema: v.record(v.string(), v.any()),
          }),
        })
      )
    ),
    reasoningEnabled: v.optional(v.boolean()),
    toolChoice: v.optional(v.string()),
  },
  handler: async (_, args) => {
    const apiKey = env.TOGETHER_AI_API_KEY;
    if (!apiKey) {
      throw new Error("TOGETHER_AI_API_KEY is not configured");
    }

    return executeTogetherLlmRequest(
      {
        model: args.model,
        messages: args.messages as LLMMessage[],
        temperature: args.temperature,
        maxTokens: args.maxTokens,
        responseFormat: args.responseFormat as LLMOptions["responseFormat"],
        reasoningEnabled: args.reasoningEnabled,
        toolChoice: args.toolChoice as LLMOptions["toolChoice"],
      },
      apiKey
    );
  },
});

// ============================================================
// Cached Wrapper
// ============================================================

const llmCache = createCachedAction(internal._agents._shared.cachedLlm.llmInternal, {
  ttl: withJitter(CACHE_TTL.generatedContent, 0.1),
  name: "llm-deterministic",
});

// ============================================================
// Public Functions
// ============================================================

/**
 * Cached LLM call - only caches when temperature=0 (deterministic)
 *
 * @param ctx - Convex context
 * @param options - LLM options including model, messages, temperature
 * @returns LLM response with content and usage stats
 */
export async function cachedLlmCall(ctx: any, options: LLMOptions): Promise<LLMResponse> {
  // Skip caching for non-deterministic calls
  if (options.temperature > 0) {
    console.log(
      `[CachedLLM] Skipping cache for non-deterministic call (temp=${options.temperature})`
    );
    return uncachedLlmCall(options);
  }

  // Build cache key for logging
  const messagesHash = await hashInput(
    options.messages.map((m) => `${m.role}:${m.content}`).join("|")
  );
  console.log(`[CachedLLM] Cached call: model=${options.model}, messagesHash=${messagesHash}`);

  // Use cached action
  return llmCache.fetch(ctx, {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    responseFormat: options.responseFormat,
    reasoningEnabled: options.reasoningEnabled,
    toolChoice: options.toolChoice,
  });
}

/**
 * Uncached LLM call (for non-deterministic or streaming calls)
 */
export async function uncachedLlmCall(options: LLMOptions): Promise<LLMResponse> {
  const apiKey = env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_AI_API_KEY is not configured");
  }

  return executeTogetherLlmRequest(options, apiKey);
}

/**
 * Check if a call should be cached (temperature=0)
 */
export function shouldCache(temperature: number): boolean {
  return temperature === 0;
}
