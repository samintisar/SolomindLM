"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { env } from "../../_lib/env";
import { extractJsonObjectString, uncachedLlmCall } from "../_shared/cachedLlm.js";

/**
 * Zod schema for structured map phase output.
 * This ensures reliable topic extraction without fragile regex parsing.
 */
export const MapOutputSchema = z.object({
  topics: z
    .array(z.string())
    .min(1, { error: "At least one topic is required" })
    .max(5, { error: "Maximum 5 topics allowed" })
    .describe("1-5 key topics that this section covers, ordered by importance"),
  summary: z
    .string()
    .min(50, { error: "Summary must be at least 50 characters" })
    .max(10000, { error: "Summary must not exceed 10000 characters" })
    .describe(
      "The complete structured summary including all sections (Key Insights, Main Themes, Supporting Evidence, etc.)"
    ),
});

export type MapOutput = z.infer<typeof MapOutputSchema>;

export interface MapOutputInvoker {
  invoke(
    messages: Array<SystemMessage | HumanMessage>,
    config?: Record<string, unknown>
  ): Promise<MapOutput>;
}

const MAP_STRUCTURED_SCHEMA_NAME = "extract_topics_and_summary";
const MAP_STRUCTURED_MAX_ATTEMPTS = 3;
const MAP_OUTPUT_JSON_SCHEMA = z.toJSONSchema(MapOutputSchema) as Record<string, unknown>;

export type InvokeMapStructuredOutputOptions = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

function parseMapStructuredContent(raw: string): MapOutput {
  const trimmed = extractJsonObjectString(raw) ?? raw.trim();
  if (!trimmed) {
    throw new Error("empty LLM content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse map JSON: ${message}`);
  }

  const validated = MapOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Map output validation failed: ${validated.error.message}`);
  }

  return validated.data;
}

function isRetriableMapStructuredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("empty llm content") ||
    message.includes("failed to parse map json") ||
    message.includes("map output validation failed") ||
    message.includes("no json payload for structured response")
  );
}

/**
 * Map-phase structured output via Together `json_schema` (not LangChain tool calling).
 * Up to 3 attempts with exponential backoff; final attempt falls back to `json_object`.
 * Uses `uncachedLlmCall` at temperature 0.3 with reasoning disabled.
 */
export async function invokeMapStructuredOutput(
  options: InvokeMapStructuredOutputOptions
): Promise<MapOutput> {
  const model = options.model ?? env.FAST_LLM;
  const maxTokens = options.maxTokens ?? 16_384;
  const temperature = options.temperature ?? 0.3;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAP_STRUCTURED_MAX_ATTEMPTS; attempt++) {
    try {
      const isLastAttempt = attempt === MAP_STRUCTURED_MAX_ATTEMPTS - 1;
      if (isLastAttempt && attempt > 0) {
        console.warn(
          `[ReportMap] Structured output attempt ${attempt + 1}/${MAP_STRUCTURED_MAX_ATTEMPTS} using json_object fallback`
        );
      }
      const userPrompt =
        attempt === 0
          ? options.userPrompt
          : `${options.userPrompt}\n\nREMINDER: Output ONLY a single valid JSON object. No commentary, planning text, or markdown outside the JSON.`;

      const response = await uncachedLlmCall({
        model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        maxTokens,
        reasoningEnabled: false,
        responseFormat: isLastAttempt
          ? { type: "json_object" }
          : {
              type: "json_schema",
              json_schema: {
                name: MAP_STRUCTURED_SCHEMA_NAME,
                schema: MAP_OUTPUT_JSON_SCHEMA,
              },
            },
      });

      const jsonPayload =
        response.structuredJson?.trim() || extractJsonObjectString(response.content) || "";
      return parseMapStructuredContent(jsonPayload);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAP_STRUCTURED_MAX_ATTEMPTS - 1 && isRetriableMapStructuredError(error)) {
        const delayMs = 1000 * 2 ** attempt;
        console.warn(
          `[ReportMap] Structured output retry ${attempt + 1}/${MAP_STRUCTURED_MAX_ATTEMPTS}: ${lastError.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Map structured output failed");
}

/**
 * @deprecated Prefer `invokeMapStructuredOutput` for GPT-OSS map phase.
 */
export function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): MapOutputInvoker {
  return llm.withStructuredOutput(schema, {
    name: MAP_STRUCTURED_SCHEMA_NAME,
  }) as unknown as MapOutputInvoker;
}
