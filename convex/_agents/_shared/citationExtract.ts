/**
 * Inline source citations in chat answers: [1] or mistaken LaTeX form \[1\]
 * (models often escape brackets when mixing markdown with math).
 */

export const INLINE_CITATION_MARKER_RE = /\\?\[(\d+)\\?\]/g;

function cloneCitationRe(): RegExp {
  return new RegExp(INLINE_CITATION_MARKER_RE.source, "g");
}

export function matchAllInlineCitations(text: string): RegExpMatchArray[] {
  return [...text.matchAll(cloneCitationRe())];
}

/** Unique 1-based indices, sorted ascending. */
export function extractUniqueSortedCitationIndices(text: string): number[] {
  const matches = [...text.matchAll(cloneCitationRe())];
  const nums = matches.map((m) => parseInt(m[1], 10)).filter((n) => !Number.isNaN(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** Remove citation markers for embeddings / cleaner text. */
export function stripInlineCitationMarkers(text: string): string {
  return text.replace(cloneCitationRe(), "").trim();
}

/** Replace [1] / \[1\] with CITE placeholders (non-math segments only — caller splits math). */
export function replaceCitationMarkersWithPlaceholders(segment: string): string {
  return segment.replace(cloneCitationRe(), "`CITE:$1`");
}
