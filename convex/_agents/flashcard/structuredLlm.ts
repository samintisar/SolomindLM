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

 
export function createStructuredLLM(llm: ChatTogetherAI, schema: z.ZodTypeAny): FlashcardOutputInvoker {
  return llm.withStructuredOutput(schema, {
    name: 'flashcard_array',
  }) as any;
}
