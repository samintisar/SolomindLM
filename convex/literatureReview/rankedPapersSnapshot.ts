/**
 * Keeps `literatureReviewRankedPapers` and @convex-dev/workflow step results under Convex's 1MiB limit.
 * Workflow journals accumulate search + dedupe + rank outputs — use short abstracts between steps.
 */

/** Max papers stored for the papers panel (matches bulk upload cap). */
export const RANKED_PAPERS_SNAPSHOT_MAX_COUNT = 100;

/** Enough for UI preview and screening LLM context without multi‑KB abstracts per paper. */
export const RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS = 2000;

/**
 * Shorter abstracts for workflow step return values (search → dedupe → rank → screen).
 * Rerank/screen only need title + lead of abstract; avoids ~1MiB journal when steps stack.
 */
export const WORKFLOW_PAPER_ABSTRACT_MAX_CHARS = 600;

export const RANKED_PAPER_SNAPSHOT_MAX_AUTHORS = 25;

export const RANKED_PAPER_SNAPSHOT_AUTHOR_MAX_CHARS = 120;

export type RankedPaperSnapshotFields = {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: "openalex" | "arxiv" | "semantic_scholar" | "pubmed";
  citationCount?: number;
  doi?: string;
  score: number;
};

function truncateWithEllipsis(text: string | undefined, maxChars: number): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= maxChars) return trimmed;
  if (maxChars <= 1) return "…";
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

export function truncateAbstractForSnapshot(abstract: string): string {
  return truncateWithEllipsis(abstract, RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS);
}

export function truncateAbstractForWorkflow(abstract: string): string {
  return truncateWithEllipsis(abstract, WORKFLOW_PAPER_ABSTRACT_MAX_CHARS);
}

export function compactAuthorsForSnapshot(authors: string[]): string[] {
  return authors
    .slice(0, RANKED_PAPER_SNAPSHOT_MAX_AUTHORS)
    .map((author) => truncateWithEllipsis(author, RANKED_PAPER_SNAPSHOT_AUTHOR_MAX_CHARS));
}

/** Trim payload fields for ranked-paper DB snapshots (papers panel). */
export function compactPaperForSnapshot<T extends RankedPaperSnapshotFields>(paper: T): T {
  return {
    ...paper,
    abstract: truncateAbstractForSnapshot(paper.abstract),
    authors: compactAuthorsForSnapshot(paper.authors),
  };
}

/** Trim papers returned from workflow actions (keeps full count for ranking). */
export function compactPaperForWorkflow<T extends RankedPaperSnapshotFields>(paper: T): T {
  return {
    ...paper,
    abstract: truncateAbstractForWorkflow(paper.abstract),
    authors: compactAuthorsForSnapshot(paper.authors),
  };
}

export function compactPapersForWorkflow<T extends RankedPaperSnapshotFields>(
  papers: T[]
): T[] {
  return papers.map(compactPaperForWorkflow);
}

/** Keep top-N by score order, with trimmed abstracts (caller should pass score-sorted papers). */
export function compactPapersForSnapshot<T extends RankedPaperSnapshotFields>(
  papers: T[]
): T[] {
  return papers.slice(0, RANKED_PAPERS_SNAPSHOT_MAX_COUNT).map(compactPaperForSnapshot);
}

/** After ranking: top-N for workflow journal + downstream screening. */
export function compactRankedPapersForWorkflow<T extends RankedPaperSnapshotFields>(
  papers: T[]
): T[] {
  return papers
    .slice(0, RANKED_PAPERS_SNAPSHOT_MAX_COUNT)
    .map(compactPaperForWorkflow);
}
