"use node";

/**
 * Expand query with keyword-based variations (no LLM overhead, ~10ms latency)
 * Helps find content when user's terminology doesn't match document terminology
 */
export function expandQueryWithKeywords(query: string): string[] {
  const variations = [query];
  const lowerQuery = query.toLowerCase();

  // Domain-independent term mappings
  const termVariations: Record<string, string[]> = {
    // Comparison/contrast terms
    difference: ["compare", "contrast", "vs", "versus", "comparison"],
    "how does it work": ["mechanism", "algorithm", "process", "methodology", "approach"],
    advantages: ["benefits", "pros", "strengths"],
    disadvantages: ["drawbacks", "cons", "weaknesses", "limitations"],
    example: ["instance", "case", "illustration"],

    // Common academic/technical variations
    definition: ["define", "meaning", "what is", "what are"],
    explain: ["describe", "elaborate", "clarify"],
    overview: ["summary", "introduction", "background"],
    purpose: ["goal", "objective", "aim", "function"],
    result: ["outcome", "output", "consequence", "effect"],
  };

  // Apply variations (limit to avoid too many search calls)
  let variationCount = 0;
  const maxVariations = 2;

  for (const [term, synonyms] of Object.entries(termVariations)) {
    if (lowerQuery.includes(term) && variationCount < maxVariations) {
      for (const synonym of synonyms.slice(0, 2)) {
        if (variationCount >= maxVariations) break;

        // Create variation by replacing the term
        const regex = new RegExp(term, "gi");
        const variation = query.replace(regex, synonym);
        if (variation !== query) {
          variations.push(variation);
          variationCount++;
        }
      }
    }
  }

  return variations.slice(0, 3); // Limit to 3 total variations (original + 2)
}
