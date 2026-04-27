/**
 * Together AI serverless E5 instruct embedding model.
 * @see .agents/skills/together-embeddings/references/models.md
 */
export const E5_EMBEDDING_MODEL = "intfloat/multilingual-e5-large-instruct" as const;

/** Hard API limit (Together E5; docs often say 514; server enforces 512). */
export const E5_TOGETHER_MAX_TOKENS = 512;
/**
 * StructuralChunker uses {@link countTokens} (~len/4) as the length function; it is only an estimate.
 * Dense markdown/code and multilingual text tokenize tighter than len/4 on Together’s BPE, so keep this
 * low enough that few chunks need aggressive {@link clipTextForTogetherE5} truncation.
 */
/** Below {@link E5_TOGETHER_MAX_TOKENS}; splitter uses est. tokens, not E5 BPE. */
export const E5_RAG_CHUNK_SIZE_TOKENS = 220;
export const E5_RAG_CHUNK_OVERLAP_TOKENS = 55;

/**
 * Chunks per Together `/v1/embeddings` call (array `input`). Fewer API requests than one-per-chunk;
 * size balances payload limits, latency, and rate limits. See .claude/skills/together-embeddings.
 */
export const E5_TOGETHER_EMBED_BATCH_SIZE = 64;
/**
 * Raw content before `query:` / `passage:` — token budget only guides the char cap; Together
 * uses its own BPE, so the hard {@link E5_MAX_BODY_CHARS} matters most.
 */
/** Room for `passage:` / `query:` prefix + Together BPE vs char-based estimates (failures at ~518 seen in dev). */
const E5_CONTENT_BUDGET_TOKENS = 420;
/**
 * Chars per token (conservative vs Together’s tokenizer). Pair with {@link E5_MAX_BODY_CHARS} so the
 * worst case stays under {@link E5_TOGETHER_MAX_TOKENS} including the instruct prefix.
 */
const E5_CONSERVATIVE_CHARS_PER_TOKEN = 1.35;
/** Hard ceiling on body length so `passage: ...` / `query: ...` stays under 512 *model* tokens. */
export const E5_MAX_BODY_CHARS = 560;

export type E5InputType = "query" | "passage";

/**
 * Truncate raw text so the request stays under Together’s 512-token cap.
 * Document chunking should target smaller pieces; this is a last-resort cap.
 */
export function clipTextForTogetherE5(text: string): string {
  if (!text) return text;
  const t = text.trim();
  const maxChars = Math.min(
    E5_MAX_BODY_CHARS,
    Math.floor(E5_CONTENT_BUDGET_TOKENS * E5_CONSERVATIVE_CHARS_PER_TOKEN)
  );
  if (t.length <= maxChars) return t;
  const truncated = t.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.75) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated;
}

/**
 * E5 Instruct uses asymmetric prefixes for retrieval quality.
 * Use "passage" for document chunks; "query" for user / HyDE / search text.
 */
export function formatE5Input(inputType: E5InputType, text: string): string {
  const trimmed = clipTextForTogetherE5(text);
  if (inputType === "query") {
    return `query: ${trimmed}`;
  }
  return `passage: ${trimmed}`;
}
