"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * Interface for the structured LLM to avoid deep type instantiation.
 * Follows the pattern from FlashcardGraph.
 */
export interface StructuredOutputInvoker<T> {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<T>;
}

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 */
export function createStructuredLLM<T>(
  llm: ChatTogetherAI,
  schema: z.ZodTypeAny,
  name: string
): StructuredOutputInvoker<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return llm.withStructuredOutput(schema, { name }) as any;
}
