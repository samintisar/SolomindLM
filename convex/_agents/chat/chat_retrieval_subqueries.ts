import { z } from "zod";

export const RetrievalSubqueriesSchema = z.object({
  subqueries: z.array(z.string()).min(1).max(6),
  rerankQuery: z.string().optional(),
});

/** Digits or common English count words (lecture notes often say "four tasks" not "4 tasks"). */
const COUNT_QUANT =
  "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";

/** "N [optional-adjectives] <counted noun>" — list-style questions in natural language. */
const COUNTED_LIST_TAIL = new RegExp(
  `\\b${COUNT_QUANT}\\s+(?:\\w+\\s+){0,6}?(items?|patterns?|types?|categories?|methods?|techniques?|strategies?|principles?|rules?|steps?|stages?|phases?|elements?|factors?|components?|ways?|kinds?|forms?|approaches?|practices?|examples?|topics?|tasks?|points?|criteria|architectures?|embeddings?|linkages?|concepts?|ideas?|reasons?|benefits?|features?|characteristics?|properties?|aspects?|dimensions?|domains?|areas?|fields?|themes?|subjects?|questions?|problems?|challenges?|solutions?|answers?)\\b`,
  "i",
);

/**
 * Many user turns are a single retrieval intent; skipping the JSON decomposition call avoids
 * extra latency and flaky fast-model 503s when status pages still show "Up".
 *
 * Queries that ask for lists, enumerations, or counts of multiple items are NOT trivial —
 * they need sub-query decomposition to retrieve enough chunks covering all requested items.
 */
export function trivialRetrievalSubqueryMessage(trimmed: string): boolean {
  if (trimmed.includes("\n")) return false;
  if (trimmed.length > 200) return false;
  if (
    /\b(compare|comparing|versus|vs\.?|differences?\s+between|similarit|contrasts?\b|respectively)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }
  // List/enumeration queries need decomposition to cover multiple items spread across chunks.
  // Matches: "list all X", "name the X", "the 20 X", "20 agentic patterns", etc.
  if (
    /\b(list|enumerate|name|every|each\s+of|how\s+many|count\s+(of|all)|complete\s+(list|set)|full\s+list)\b/i.test(
      trimmed
    ) ||
    COUNTED_LIST_TAIL.test(trimmed)
  ) {
    return false;
  }
  const wc = trimmed.split(/\s+/).filter(Boolean).length;
  const targeted =
    /^(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did|can|could|should|would)\s+\S+/i.test(
      trimmed
    ) ||
    /^define\s+\S+/i.test(trimmed) ||
    /^explain\s+(the\s+)?\S+/i.test(trimmed);
  if (targeted) return true;
  return wc <= 10;
}

/**
 * Parses retrieval-subquery JSON from an LLM response. Returns `null` on any
 * failure so the caller can degrade to the original query as a single subquery.
 *
 * Failure paths are logged at WARN level so the silent-fallback behavior is
 * observable: a sustained spike in "no_json_match" or "schema_invalid" means
 * the prompt or upstream model output drifted and decomposition is effectively
 * disabled.
 */
export function parseRetrievalSubqueriesFromLlmContent(
  rawContent: string
): { subqueries: string[]; rerankQuery?: string } | null {
  let text = rawContent;
  try {
    // Strip both <think>…</think> (Qwen-style) and <redacted_thinking>…</redacted_thinking>
    // (Anthropic-style placeholders). The previous regex paired
    // <redacted_thinking> with </think>, so it never matched anything and
    // thinking content leaked into the JSON-extraction step.
    text = rawContent
      .trim()
      .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(
        "[chat_retrieval_subqueries] parse fallback: no_json_match",
        { previewLen: text.length, preview: text.slice(0, 200) }
      );
      return null;
    }
    const raw = JSON.parse(match[0]);
    const parsed = RetrievalSubqueriesSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        "[chat_retrieval_subqueries] parse fallback: schema_invalid",
        { issues: parsed.error.issues.slice(0, 3) }
      );
      return null;
    }
    const subs = parsed.data.subqueries.map((s) => s.trim()).filter(Boolean);
    if (subs.length === 0) {
      console.warn("[chat_retrieval_subqueries] parse fallback: empty_subqueries");
      return null;
    }
    const rq = parsed.data.rerankQuery?.trim();
    return {
      subqueries: subs.slice(0, 6),
      rerankQuery: rq || undefined,
    };
  } catch (err) {
    console.warn(
      "[chat_retrieval_subqueries] parse fallback: exception",
      { error: err instanceof Error ? err.message : String(err), previewLen: text.length }
    );
    return null;
  }
}

/**
 * Detects list/enumeration queries that need diverse subqueries for broad retrieval coverage.
 */
export function isListEnumerationQuery(trimmed: string): boolean {
  if (
    /\b(list|enumerate|name|every|each\s+of|how\s+many|count\s+(of|all)|complete\s+(list|set)|full\s+list)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (COUNTED_LIST_TAIL.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Extracts the core topic phrase from a list query.
 * E.g. "What are the 20 agentic patterns?" → "agentic patterns"
 */
function extractListTopic(trimmed: string): string {
  // Try to extract "N <topic>" pattern
  const numMatch = trimmed.match(/\b\d+\s+(.+?)[\s?!.]*$/i);
  if (numMatch) return numMatch[1].trim();
  // Try to extract after list/name/enumerate
  const listMatch = trimmed.match(
    /\b(?:list|name|enumerate|show)\s+(?:all\s+|the\s+)?(.+?)[\s?!.]*$/i
  );
  if (listMatch) return listMatch[1].trim();
  // Fallback: last meaningful phrase
  const words = trimmed.replace(/[?!.]+$/, "").split(/\s+/);
  return words.slice(-3).join(" ");
}

/**
 * Generates diverse subqueries for list/enumeration queries to maximize retrieval coverage.
 * Each subquery targets a different angle to retrieve chunks covering different items.
 * Designed to retrieve chunks from different sections of the source material.
 */
export function expandListSubqueries(
  originalQuery: string,
  existingSubqueries: string[]
): string[] {
  const maxSubqueries = 6;
  const result = [...existingSubqueries];
  const topic = extractListTopic(originalQuery);

  // More targeted variations that aim to retrieve chunks from different document sections
  // These are designed to capture items that might be mentioned in different contexts
  const variations = [
    `${topic} complete list all items overview`,
    `${topic} definitions terminology and concepts`,
    `${topic} categories types classifications and kinds`,
    `${topic} examples specific instances and use cases`,
    `${topic} advanced methods techniques and strategies`,
    `${topic} implementation details and practical applications`,
    `${topic} collaboration patterns multi-agent systems`,
    `${topic} safety guardrails validation and monitoring`,
    `${topic} evaluation metrics testing and quality assurance`,
    `${topic} configuration setup parameters and options`,
  ];

  for (const v of variations) {
    if (result.length >= maxSubqueries) break;
    // Avoid duplicates (case-insensitive)
    const normalized = v.toLowerCase();
    if (!result.some((r) => r.toLowerCase() === normalized)) {
      result.push(v);
    }
  }

  return result;
}
