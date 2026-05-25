/** Max stored review title length (UI truncation handled separately). */
export const MAX_REVIEW_TITLE_LENGTH = 120;

/**
 * Normalize an LLM- or heuristic-derived review title for display and storage.
 */
export function normalizeReviewTitle(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
  if (!trimmed) return "Literature Review";
  if (trimmed.length <= MAX_REVIEW_TITLE_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_REVIEW_TITLE_LENGTH - 1).trimEnd() + "…";
}

/**
 * Strip common instruction tails from a user query to build a readable fallback title.
 */
export function fallbackReviewTitleFromQuery(query: string): string {
  const q = query.trim();
  if (!q) return "Literature Review";

  // Prefer the first sentence when the user pasted a long brief with requirements.
  const firstSentence = q.split(/(?<=[.?!])\s+/)[0]?.trim() ?? q;
  let candidate = firstSentence;

  // Drop trailing requirement clauses often separated by "Include", "Provide", etc.
  const requirementSplit = candidate.match(
    /^(.*?)(?:\s+(?:include|provide|cover|discuss|compare|analyze|analyse)\b.+)$/i
  );
  if (requirementSplit?.[1] && requirementSplit[1].trim().length >= 12) {
    candidate = requirementSplit[1].trim();
  }

  // Remove leading prompt-style prefixes.
  candidate = candidate
    .replace(/^(?:please\s+)?(?:write|create|generate|prepare)\s+(?:a\s+)?/i, "")
    .replace(/^(?:literature\s+review|systematic\s+review|scoping\s+review)\s+(?:on|of|about)\s+/i, "")
    .trim();

  if (!candidate) return normalizeReviewTitle(q.slice(0, MAX_REVIEW_TITLE_LENGTH));
  return normalizeReviewTitle(candidate);
}

export function literatureTableTitle(reviewTitle: string): string {
  const base = normalizeReviewTitle(reviewTitle);
  if (base.toLowerCase().endsWith("evidence table")) return base;
  return `${base}: Evidence Table`;
}

export function literatureReportTitle(reviewTitle: string): string {
  const base = normalizeReviewTitle(reviewTitle);
  return base.replace(/^(?:report\s*[—-]\s*)/i, "").trim() || "Literature Review";
}
