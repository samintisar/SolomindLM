"use node";

import { z } from "zod";
import { env } from "../../_lib/env";
import { extractJsonObjectString, uncachedLlmCall } from "./cachedLlm.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const JSON_REMINDER =
  "\n\nREMINDER: Output ONLY a single valid JSON object. No commentary, planning text, or markdown outside the JSON.";

export type InvokeStructuredOutputOptions<T> = {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Default false — GPT-OSS map/structured phases should disable reasoning. */
  reasoningEnabled?: boolean;
  maxAttempts?: number;
  /** Prefix for retry / fallback log lines (e.g. `WrittenQuestionsMap`). */
  logPrefix?: string;
};

function parseStructuredContent<T>(raw: string, schema: z.ZodType<T>): T {
  const trimmed = extractJsonObjectString(raw) ?? raw.trim();
  if (!trimmed) {
    throw new Error("empty LLM content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse structured JSON: ${message}`);
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Structured output validation failed: ${validated.error.message}`);
  }

  return validated.data;
}

function isRetriableStructuredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("empty llm content") ||
    message.includes("failed to parse structured json") ||
    message.includes("structured output validation failed") ||
    message.includes("no json payload for structured response")
  );
}

/**
 * Structured output via Together `json_schema` (not LangChain tool calling).
 * Handles GPT-OSS models that return JSON in `reasoning` when `content` is empty.
 * Up to 3 attempts with exponential backoff; final attempt falls back to `json_object`.
 */
export async function invokeStructuredOutput<T>(
  options: InvokeStructuredOutputOptions<T>
): Promise<T> {
  const model = options.model ?? env.FAST_LLM;
  const maxTokens = options.maxTokens ?? 16_384;
  const temperature = options.temperature ?? 0.3;
  const reasoningEnabled = options.reasoningEnabled ?? false;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const logPrefix = options.logPrefix ?? "StructuredOutput";
  const jsonSchema = z.toJSONSchema(options.schema) as Record<string, unknown>;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt && attempt > 0) {
        console.warn(
          `[${logPrefix}] Structured output attempt ${attempt + 1}/${maxAttempts} using json_object fallback`
        );
      }

      const userPrompt = attempt === 0 ? options.userPrompt : `${options.userPrompt}${JSON_REMINDER}`;

      const response = await uncachedLlmCall({
        model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        maxTokens,
        reasoningEnabled,
        responseFormat: isLastAttempt
          ? { type: "json_object" }
          : {
              type: "json_schema",
              json_schema: {
                name: options.schemaName,
                schema: jsonSchema,
              },
            },
      });

      const jsonPayload =
        response.structuredJson?.trim() || extractJsonObjectString(response.content) || "";
      return parseStructuredContent(jsonPayload, options.schema);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts - 1 && isRetriableStructuredError(error)) {
        const delayMs = 1000 * 2 ** attempt;
        console.warn(
          `[${logPrefix}] Structured output retry ${attempt + 1}/${maxAttempts}: ${lastError.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Structured output failed");
}
