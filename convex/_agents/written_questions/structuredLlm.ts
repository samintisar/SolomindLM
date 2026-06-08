"use node";

import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import { env } from "../../_lib/env";
import { invokeStructuredOutput } from "../_shared/structuredLlm.js";
import type { WrittenQuestionsResponse } from "./prompts.js";

export interface WrittenQuestionsOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<WrittenQuestionsResponse>;
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

export function createStructuredLLM<T = WrittenQuestionsResponse>(
  schema: z.ZodTypeAny,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    schemaName?: string;
    reasoningEnabled?: boolean;
  }
): { invoke(messages: Array<SystemMessage | HumanMessage>): Promise<T> } {
  const model = options?.model ?? env.FAST_LLM;
  const schemaName = options?.schemaName ?? "written_questions";

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
        logPrefix: "WrittenQuestionsStructured",
      }) as Promise<T>;
    },
  };
}
