"use node";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { env } from "../../_lib/env";
import { invokeWithTimeout } from "../_shared/index.js";
import { invokeStructuredOutput } from "../_shared/structuredLlm.js";
import { GRAPH_CONFIG } from "./config.js";
import { MAP_PROMPT, MAP_SYSTEM_PROMPT } from "./prompts.js";
import type { ConceptExtraction } from "./state.js";

export const ConceptExtractionSchema = z.object({
  main_theme: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.string()),
});

/**
 * Typed concept extraction using structured output (Together json_schema).
 */
export async function extractConcepts(
  content: string,
  options?: { model?: string; language?: string }
): Promise<ConceptExtraction> {
  return invokeWithTimeout(
    () =>
      invokeStructuredOutput({
        systemPrompt: MAP_SYSTEM_PROMPT,
        userPrompt: MAP_PROMPT.replace("{content}", content),
        schema: ConceptExtractionSchema,
        schemaName: "concept_extraction",
        model: options?.model ?? env.FAST_LLM,
        logPrefix: "MindMapMap",
      }),
    GRAPH_CONFIG.MAP_TIMEOUT_MS,
    "MindMapMap"
  );
}

/** @deprecated Use extractConcepts — kept for tests referencing message-style invoke. */
export async function extractConceptsFromMessages(
  messages: Array<SystemMessage | HumanMessage>
): Promise<ConceptExtraction> {
  const systemPrompt = messages
    .filter((m) => m.getType() === "system")
    .map((m) => (typeof m.content === "string" ? m.content : String(m.content)))
    .join("\n");
  const userPrompt = messages
    .filter((m) => m.getType() === "human")
    .map((m) => (typeof m.content === "string" ? m.content : String(m.content)))
    .join("\n");

  return invokeStructuredOutput({
    systemPrompt,
    userPrompt,
    schema: ConceptExtractionSchema,
    schemaName: "concept_extraction",
    logPrefix: "MindMapMap",
  });
}
