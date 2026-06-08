"use node";

import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import { env } from "../../_lib/env";
import { invokeStructuredOutput } from "../_shared/structuredLlm.js";

/**
 * Interface for the structured LLM to avoid deep type instantiation.
 */
export interface StructuredOutputInvoker<T> {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<T>;
}

function promptsFromMessages(messages: Array<SystemMessage | HumanMessage>): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = messages
    .filter((m) => m.getType() === "system")
    .map((m) => (typeof m.content === "string" ? m.content : String(m.content)))
    .join("\n");
  const userPrompt = messages
    .filter((m) => m.getType() === "human")
    .map((m) => (typeof m.content === "string" ? m.content : String(m.content)))
    .join("\n");
  return { systemPrompt, userPrompt };
}

export function createStructuredLLM<T>(
  schema: z.ZodTypeAny,
  name: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    reasoningEnabled?: boolean;
    logPrefix?: string;
  }
): StructuredOutputInvoker<T> {
  const model = options?.model ?? env.FAST_LLM;

  return {
    invoke: async (messages) => {
      const { systemPrompt, userPrompt } = promptsFromMessages(messages);
      return invokeStructuredOutput({
        systemPrompt,
        userPrompt,
        schema,
        schemaName: name,
        model,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        reasoningEnabled: options?.reasoningEnabled,
        logPrefix: options?.logPrefix ?? "QuizStructured",
      }) as Promise<T>;
    },
  };
}
