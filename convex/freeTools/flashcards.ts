// convex/freeTools/flashcards.ts
"use node";

import { v } from "convex/values";
import { invokeStructuredOutput } from "../_agents/_shared/structuredLlm";
import { invokeWithTimeout } from "../_agents/_shared/timeout";
import {
  FlashcardArraySchema,
  getMapPrompt,
  MAP_SYSTEM_PROMPT,
} from "../_agents/flashcard/prompts";
import { internalAction } from "../_generated/server";
import { env } from "../_lib/env";
import {
  deriveDeckTitle,
  FREE_FLASHCARD_LLM_PHASE,
  FREE_FLASHCARD_LLM_TIMEOUT_MS,
} from "../_lib/freeToolBounds";
import { normalizeMathMarkdownDeep } from "../_shared/mathMarkdown";
import { buildFreeDeck, cardsToRequest } from "./deck";
import { freeDeckCardValidator } from "./validators";

/**
 * One structured call over the whole (already bounded) text: the studio single-chunk path.
 * `maxAttempts: 1` keeps it to exactly one LLM call, so the reserved attempt windows bound spend;
 * a malformed response surfaces as a failed run the visitor can retry against their own attempts.
 */
export const generate = internalAction({
  args: { text: v.string(), cardCount: v.number() },
  returns: v.object({ title: v.string(), cards: v.array(freeDeckCardValidator) }),
  handler: async (_ctx, { text, cardCount }) => {
    const response = await invokeWithTimeout(
      () =>
        invokeStructuredOutput({
          systemPrompt: MAP_SYSTEM_PROMPT,
          userPrompt: getMapPrompt({
            chunk: text,
            cardCount,
            cardsPerChunk: cardsToRequest(cardCount),
            difficulty: "medium",
          }),
          schema: FlashcardArraySchema,
          schemaName: "flashcards",
          model: env.FAST_LLM,
          maxTokens: 8192,
          maxAttempts: 1,
          logPrefix: "FreeFlashcards",
        }),
      FREE_FLASHCARD_LLM_TIMEOUT_MS,
      FREE_FLASHCARD_LLM_PHASE
    );

    const cards = normalizeMathMarkdownDeep(buildFreeDeck(response.flashcards, cardCount));
    if (cards.length === 0) throw new Error("no_usable_cards");
    return {
      title: deriveDeckTitle(text),
      cards: cards.map(({ type, front, back, topic }) => ({ type, front, back, topic })),
    };
  },
});
