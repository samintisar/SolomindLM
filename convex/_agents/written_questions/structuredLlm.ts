"use node";

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import type { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { WrittenQuestionsResponse } from "./prompts.js";

export interface WrittenQuestionsOutputInvoker {
  invoke(messages: Array<SystemMessage | HumanMessage>): Promise<WrittenQuestionsResponse>;
}

export function createStructuredLLM(
  llm: ChatTogetherAI,
  schema: z.ZodTypeAny
): WrittenQuestionsOutputInvoker {
  return llm.withStructuredOutput(schema, {
    name: "written_questions",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}
