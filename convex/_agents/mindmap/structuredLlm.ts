"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import { invokeWithTimeout, createLangSmithRunConfig } from "../_shared/index.js";

import { GRAPH_CONFIG } from "./config.js";
import { MAP_PROMPT, MAP_SYSTEM_PROMPT } from "./prompts.js";
import type { ConceptExtraction } from "./state.js";

export const ConceptExtractionSchema = z.object({
  main_theme: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
});

/**
 * Typed concept extraction using the fast LLM and structured output.
 */
export async function extractConcepts(
  fastLlm: ChatTogetherAI,
  content: string
): Promise<ConceptExtraction> {
  const structuredLlm = fastLlm.withStructuredOutput<ConceptExtraction>(ConceptExtractionSchema, {
    name: "concept_extraction",
  });

  return await invokeWithTimeout(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (structuredLlm as any).invoke(
        [
          new SystemMessage(MAP_SYSTEM_PROMPT),
          new HumanMessage(MAP_PROMPT.replace("{content}", content)),
        ],
        createLangSmithRunConfig({
          runName: "MindMapGraph.MapProcess",
          tags: ["agent", "mindmap", "map"],
          metadata: {
            contentLength: content.length,
          },
        })
      ),
    GRAPH_CONFIG.MAP_TIMEOUT_MS,
    "MindMapMap"
  );
}
