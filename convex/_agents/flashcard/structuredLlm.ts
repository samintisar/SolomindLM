"use node";

import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import { env } from "../../_lib/env";
import { invokeStructuredOutput } from "../_shared/structuredLlm.js";
import type { FlashcardResponse } from "./prompts.js";

export interface FlashcardOutputInvoker {
  invoke(
    messages: Array<SystemMessage | HumanMessage>,
    config?: Record<string, unknown>
  ): Promise<FlashcardResponse>;
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

export function createStructuredLLM(
  schema: z.ZodTypeAny,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    schemaName?: string;
    reasoningEnabled?: boolean;
  }
): FlashcardOutputInvoker {
  const model = options?.model ?? env.FAST_LLM;
  const schemaName = options?.schemaName ?? "flashcard_array";

  return {
    invoke: async (messages) => {
      const { systemPrompt, userPrompt } = promptsFromMessages(messages);
      return invokeStructuredOutput({
        systemPrompt,
        userPrompt,
        schema,
        schemaName,
        model,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        reasoningEnabled: options?.reasoningEnabled,
        logPrefix: "FlashcardStructured",
      }) as Promise<FlashcardResponse>;
    },
  };
}
