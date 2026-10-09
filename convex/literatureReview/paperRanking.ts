/**
 * Ranking for literature review candidates (#351): relevance to the question blended with the
 * paper's influence, so widely cited work surfaces next to recent papers instead of being
 * outranked by any paper whose abstract happens to echo the question's wording.
 */

/** Share of the blended score that comes from the reranker's relevance to the question. */
export const RELEVANCE_WEIGHT = 0.7;

/** Share of the blended score that comes from citation influence. */
export const CITATION_WEIGHT = 0.3;

/** Years of exposure assumed for a paper with no publication year. */
const UNKNOWN_AGE_YEARS = 5;

/**
 * Citation influence: `log1p(citations per year since publication)`. Dividing by age keeps a
 * young paper from being buried under older ones that simply had longer to collect citations,
 * and the log stops a handful of landmark papers from flattening everyone else.
 * Undefined when the citation count is unknown (some sources do not report one).
 */
export function citationImpact(
  citationCount: number | undefined,
  year: number | undefined,
  currentYear: number
): number | undefined {
  if (citationCount == null || !Number.isFinite(citationCount)) return undefined;
  const years = year == null ? UNKNOWN_AGE_YEARS : Math.max(1, currentYear - year + 1);
  return Math.log1p(Math.max(0, citationCount) / years);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Min-max scale to [0, 1]; a pool with no spread scales to 1 throughout. */
function minMaxScale(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values.map((value) => (range > 0 ? (value - min) / range : 1));
}

/**
 * Sorts papers by `RELEVANCE_WEIGHT * relevance + CITATION_WEIGHT * influence` and writes that
 * blend (0..1) to each paper's `score`. Both signals are scaled across this candidate pool.
 *
 * `relevance[i]` is the reranker score for `papers[i]`; a missing one counts as the least
 * relevant. A paper with an unknown citation count gets the pool's median influence, so a source
 * that reports no counts is neither boosted nor buried. Ties keep the input order.
 */
export function rankByRelevanceAndInfluence<
  T extends { citationCount?: number; year?: number; score: number },
>(papers: T[], relevance: Array<number | undefined>, currentYear: number): T[] {
  if (papers.length === 0) return [];

  const scoredIndexes = papers
    .map((_, i) => i)
    .filter((i) => relevance[i] != null && Number.isFinite(relevance[i]));
  const scaledRelevance = minMaxScale(scoredIndexes.map((i) => relevance[i] as number));
  // A paper the reranker did not score sits at the bottom, even when the pool has no spread.
  const relevanceScores = papers.map(() => 0);
  scoredIndexes.forEach((paperIndex, k) => {
    relevanceScores[paperIndex] = scaledRelevance[k];
  });

  const impacts = papers.map((p) => citationImpact(p.citationCount, p.year, currentYear));
  const known = impacts.filter((i): i is number => i !== undefined);
  const neutralImpact = known.length > 0 ? median(known) : 0;
  const maxImpact = known.length > 0 ? Math.max(...known) : 0;
  const influenceScores = impacts.map((impact) =>
    maxImpact > 0 ? (impact ?? neutralImpact) / maxImpact : 0
  );

  return papers
    .map((paper, index) => ({
      paper,
      index,
      score: RELEVANCE_WEIGHT * relevanceScores[index] + CITATION_WEIGHT * influenceScores[index],
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ paper, score }) => ({ ...paper, score }));
}
