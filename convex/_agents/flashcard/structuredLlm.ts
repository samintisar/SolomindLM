"use node"

import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import type { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import type { FlashcardResponse } from './prompts.js';

export interface FlashcardOutputInvoker {
  invoke(
    messages: Array<SystemMessage | HumanMessage>,
    config?: Record<string, unknown>
  ): Promise<FlashcardResponse>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): FlashcardOutputInvoker {
  // @ts-ignore - Type instantiation is excessively deep with LangChain's withStructuredOutput
  return llm.withStructuredOutput(schema, {
    name: 'flashcard_array',
  }) as any;
}
