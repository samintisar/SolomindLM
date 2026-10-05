import type { PaperScope } from "@convex/literatureReview/notebookPapers";
import type { Source } from "@/shared/types";

/**
 * Selected notebook sources a literature review can include as papers (#301): finished PDFs and
 * saved papers. The server applies the same rule again, so this only decides what the composer offers.
 */
export function selectedNotebookPaperIds(sources: readonly Source[]): string[] {
  return sources
    .filter(
      (s) => s.selected && s.status === "completed" && (s.type === "PDF" || s.type === "PAPER")
    )
    .map((s) => s.id);
}

export function paperScopeLabel(scope: PaperScope, paperCount: number): string {
  const papers = paperCount === 1 ? "paper" : `${paperCount} papers`;
  return scope === "papers_only" ? `Only your ${papers}` : `Your ${papers} + search`;
}

interface IncludedRowLike {
  isIncluded: boolean;
  citation: { sourceApi: string } | null;
}

/** Included table rows split into the user's notebook papers and papers found by search. */
export function countNotebookAndSearchPapers(rows: readonly IncludedRowLike[]): {
  notebook: number;
  search: number;
} {
  let notebook = 0;
  let search = 0;
  for (const row of rows) {
    if (!row.isIncluded) continue;
    if (row.citation?.sourceApi === "notebook") notebook++;
    else search++;
  }
  return { notebook, search };
}
