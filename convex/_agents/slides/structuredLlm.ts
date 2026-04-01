"use node"

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import type { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

/**
 * Interface for the structured LLM to avoid deep type instantiation.
 */
export interface StructuredOutputInvoker<T> {
  invoke(
    messages: Array<SystemMessage | HumanMessage>,
    config?: Record<string, unknown>
  ): Promise<T>;
}

/**
 * Helper function to create a structured LLM without triggering deep type instantiation.
 */
export function createStructuredLLM<T>(
  llm: ChatTogetherAI,
  schema: z.ZodTypeAny,
  name: string
): StructuredOutputInvoker<T> {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(schema, { name }) as any;
}
