"use node";

import { env } from "../../_lib/env";
import { uncachedLlmCall } from "./cachedLlm.js";
import { EmptyLlmResponseError } from "./llmErrors.js";
import { fromProviderUsage, type TokenUsage } from "./usageAggregate.js";

export type InvokeTogetherTextOptions = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Default false for map phases; true for reduce/synthesis with smart models. */
  reasoningEnabled?: boolean;
  onUsage?: (usage: TokenUsage) => void;
};

/**
 * Plain-text LLM call via Together REST (not LangChain).
 * Assistant text via `uncachedLlmCall` (falls back to `reasoning` for GPT-OSS when `content` is empty).
 */
export async function invokeTogetherText(options: InvokeTogetherTextOptions): Promise<string> {
  const model = options.model ?? env.FAST_LLM;
  const response = await uncachedLlmCall({
    model,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    maxTokens: options.maxTokens,
    reasoningEnabled: options.reasoningEnabled ?? false,
  });

  // Report usage before the empty check: an empty completion can still burn the whole budget.
  const usage = fromProviderUsage(response.usage);
  if (usage) {
    options.onUsage?.(usage);
  }

  const text = response.content.trim();
  if (!text) {
    throw new EmptyLlmResponseError({
      model,
      finishReason: response.finishReason,
      completionTokens: response.usage?.completionTokens,
    });
  }
  return text;
}
