"use node";
/**
 * Search Query Refiner
 *
 * Uses a fast LLM call to rewrite the user's natural-language question into
 * an unambiguous, search-engine-friendly query before sending it to Tavily.
 *
 * This resolves abbreviations, domain-specific jargon, and conversational
 * phrasing that web search engines may misinterpret, producing more relevant
 * results without slowing down the pipeline significantly.
 */

import { uncachedLlmCall } from "../_shared/cachedLlm";
import { env } from "../../_lib/env";

/**
 * Rewrite a user message into a concise, search-optimized query.
 *
 * Falls back to the original message on any error so the search pipeline
 * never blocks on a refinement failure.
 */
export async function refineWebSearchQuery(userMessage: string): Promise<string> {
  const trimmed = userMessage.trim();
  if (!trimmed) return trimmed;

  const model = env.FAST_LLM;

  try {
    const response = await uncachedLlmCall({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are a search query optimizer. Rewrite the user's question into a concise,",
            "unambiguous web search query.",
            "",
            "Rules:",
            "- Resolve abbreviations, acronyms, and ambiguous terms to their most likely",
            "  intended meaning in the context of the question.",
            "- If a term could refer to unrelated domains, add enough context to disambiguate",
            "  (e.g. expand to the full technical name or add a domain qualifier).",
            "- Remove filler words, greetings, and conversational language.",
            "- Keep the query under 20 words.",
            "- Output ONLY the search query text — no quotes, no explanation, no labels.",
          ].join("\n"),
        },
        {
          role: "user",
          content: trimmed,
        },
      ],
      temperature: 0,
      maxTokens: 120,
      reasoningEnabled: false,
      toolChoice: "none",
    });

    const refined = response.content.trim();
    if (refined && refined.length >= 3) {
      console.log(
        `[SearchQueryRefiner] Refined: "${trimmed.slice(0, 80)}" → "${refined.slice(0, 80)}"`
      );
      return refined;
    }

    console.warn("[SearchQueryRefiner] LLM returned empty/short result, using original query");
    return trimmed;
  } catch (error) {
    console.warn("[SearchQueryRefiner] Refinement failed, using original query:", error);
    return trimmed;
  }
}
