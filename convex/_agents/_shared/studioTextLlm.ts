"use node";

import { env } from "../../_lib/env";
import { uncachedLlmCall } from "./cachedLlm.js";

export type InvokeTogetherTextOptions = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Default false for map phases; true for reduce/synthesis with smart models. */
  reasoningEnabled?: boolean;
};

/**
 * Plain-text LLM call via Together REST (not LangChain).
 * Assistant text via `uncachedLlmCall` (falls back to `reasoning` for GPT-OSS when `content` is empty).
 */
export async function invokeTogetherText(options: InvokeTogetherTextOptions): Promise<string> {
  const response = await uncachedLlmCall({
    model: options.model ?? env.FAST_LLM,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    maxTokens: options.maxTokens,
    reasoningEnabled: options.reasoningEnabled ?? false,
  });

  const text = response.content.trim();
  if (!text) {
    throw new Error("LLM returned empty text response");
  }
  return text;
}
