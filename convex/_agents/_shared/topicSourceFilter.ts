/**
 * Narrow a studio job's sources to the requested topic (#288). Each source is scored by how
 * closely its best-matching chunks match the request embedding; sources that score clearly below
 * the best one are dropped, and every chunk of the sources that stay is kept. When no source
 * stands out (a generic request), every source stays.
 */

/** How many of a source's best-matching chunks make up its score. */
export const TOPIC_SOURCE_TOP_K = 3;

/**
 * A source is dropped when its score is more than this far below the best source's score
 * (cosine similarity, text-embedding-3-small).
 */
export const TOPIC_SOURCE_GAP = 0.1;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Each document's score: the mean similarity of its `topK` best-matching chunks. */
export function documentTopicScores(
  chunks: Array<{ documentId: string; similarity: number }>,
  topK = TOPIC_SOURCE_TOP_K
): Map<string, number> {
  const byDocument = new Map<string, number[]>();
  for (const { documentId, similarity } of chunks) {
    const list = byDocument.get(documentId) ?? [];
    list.push(similarity);
    byDocument.set(documentId, list);
  }
  const scores = new Map<string, number>();
  for (const [documentId, similarities] of byDocument) {
    const best = similarities.sort((x, y) => y - x).slice(0, topK);
    scores.set(documentId, best.reduce((sum, s) => sum + s, 0) / best.length);
  }
  return scores;
}

/** Keep the sources within `gap` of the best score; the best source always stays. */
export function selectTopicDocuments(
  scores: Map<string, number>,
  gap = TOPIC_SOURCE_GAP
): { keep: string[]; dropped: string[] } {
  const best = Math.max(...scores.values());
  const keep: string[] = [];
  const dropped: string[] = [];
  for (const [documentId, score] of scores) {
    (score >= best - gap ? keep : dropped).push(documentId);
  }
  return { keep, dropped };
}
