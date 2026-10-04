/**
 * Narrow a studio job's sources to the requested topic (#288). Each source is scored by how
 * closely its best-matching chunks match the request embedding; sources that score clearly below
 * the best one are dropped, and every chunk of the sources that stay is kept. When no source
 * stands out (a generic request), every source stays.
 */

/** How many of a source's best-matching chunks make up its score. */
export const TOPIC_SOURCE_TOP_K = 3;

/**
 * The smallest drop between neighbouring source scores (cosine similarity,
 * text-embedding-3-small) that splits on-topic from off-topic sources. Calibrated on the use-case
 * pack requests on dev (2026-10-04): requests that should keep every source had their largest drop
 * at 0.065 or less; topic requests that should narrow had a drop of at least 0.104.
 */
export const TOPIC_SOURCE_GAP = 0.085;

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

/**
 * Similarity of each chunk to the topic. Chunks without an embedding, or embedded with a model of
 * a different size (e.g. before a model change), are skipped; a source with no scored chunks stays.
 */
export function chunkTopicSimilarities(
  chunks: Array<{ documentId: string; embedding?: number[] }>,
  topicEmbedding: number[]
): Array<{ documentId: string; similarity: number }> {
  return chunks.flatMap((c) =>
    c.embedding?.length === topicEmbedding.length
      ? [{ documentId: c.documentId, similarity: cosineSimilarity(topicEmbedding, c.embedding) }]
      : []
  );
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

/**
 * Sort sources by score and find the largest drop between neighbours. If it is at least `gap`,
 * the sources below it are dropped; otherwise (no clear split, as for a generic request) every
 * source stays. The best source always stays.
 */
export function selectTopicDocuments(
  scores: Map<string, number>,
  gap = TOPIC_SOURCE_GAP
): { keep: string[]; dropped: string[] } {
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  let cutAfter = -1;
  let largestDrop = 0;
  for (let i = 0; i < ranked.length - 1; i++) {
    const drop = ranked[i][1] - ranked[i + 1][1];
    if (drop > largestDrop) {
      largestDrop = drop;
      cutAfter = i;
    }
  }
  const split = largestDrop >= gap ? cutAfter + 1 : ranked.length;
  return {
    keep: ranked.slice(0, split).map(([id]) => id),
    dropped: ranked.slice(split).map(([id]) => id),
  };
}
