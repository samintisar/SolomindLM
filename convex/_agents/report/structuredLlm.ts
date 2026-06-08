"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { invokeStructuredOutput } from "../_shared/structuredLlm.js";

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

export type InvokeMapStructuredOutputOptions = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

/**
 * Map-phase structured output via Together `json_schema` (not LangChain tool calling).
 * @see invokeStructuredOutput for retry / GPT-OSS handling.
 */
export async function invokeMapStructuredOutput(
  options: InvokeMapStructuredOutputOptions
): Promise<MapOutput> {
  return invokeStructuredOutput({
    ...options,
    schema: MapOutputSchema,
    schemaName: MAP_STRUCTURED_SCHEMA_NAME,
    logPrefix: "ReportMap",
  });
}

/**
 * @deprecated Prefer `invokeMapStructuredOutput` for GPT-OSS map phase.
 */
export function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): MapOutputInvoker {
  return llm.withStructuredOutput(schema, {
    name: MAP_STRUCTURED_SCHEMA_NAME,
  }) as unknown as MapOutputInvoker;
}
