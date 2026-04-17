import { z } from "zod";

export const RetrievalSubqueriesSchema = z.object({
  subqueries: z.array(z.string()).min(1).max(4),
  rerankQuery: z.string().optional(),
});

/**
 * Many user turns are a single retrieval intent; skipping the JSON decomposition call avoids
 * extra latency and flaky fast-model 503s when status pages still show "Up".
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

export function parseRetrievalSubqueriesFromLlmContent(
  rawContent: string
): { subqueries: string[]; rerankQuery?: string } | null {
  try {
    const text = rawContent
      .trim()
      .replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, "")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const raw = JSON.parse(match[0]);
    const parsed = RetrievalSubqueriesSchema.safeParse(raw);
    if (!parsed.success) return null;
    const subs = parsed.data.subqueries.map((s) => s.trim()).filter(Boolean);
    if (subs.length === 0) return null;
    const rq = parsed.data.rerankQuery?.trim();
    return {
      subqueries: subs.slice(0, 4),
      rerankQuery: rq || undefined,
    };
  } catch {
    return null;
  }
}
