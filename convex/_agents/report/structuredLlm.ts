"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * Zod schema for structured map phase output.
 * This ensures reliable topic extraction without fragile regex parsing.
 */
export const MapOutputSchema = z.object({
  topics: z
    .array(z.string())
    .min(1, { error: "At least one topic is required" })
    .max(5, { error: "Maximum 5 topics allowed" })
    .describe("3-5 key topics that this section covers, ordered by importance"),
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

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 */
export function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): MapOutputInvoker {
  return llm.withStructuredOutput(schema, {
    name: "extract_topics_and_summary",
  }) as any;
}
