export type RankedPaperSource = "arxiv" | "semantic_scholar" | "pubmed";

export interface RankedPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: RankedPaperSource;
  citationCount?: number;
  doi?: string;
  score: number;
}

export function rankedPaperKey(paper: RankedPaper, index: number): string {
  const doi = paper.doi?.toLowerCase().trim();
  if (doi) return `doi:${doi}`;
  const first = paper.authors[0]?.split(",")[0]?.trim().toLowerCase() ?? "";
  return `idx:${index}|${paper.title.toLowerCase().trim()}|${first}`;
}

export function sourceLabel(source: RankedPaperSource): string {
  switch (source) {
    case "arxiv":
      return "arXiv (Cornell University)";
    case "semantic_scholar":
      return "Semantic Scholar";
    case "pubmed":
      return "PubMed";
    default:
      return "Journal Unavailable";
  }
}

export function formatAuthorsLine(authors: string[], maxShown = 2): string {
  if (authors.length === 0) return "Unknown authors";
  const shown = authors.slice(0, maxShown).join(", ");
  const extra = authors.length > maxShown ? ` + ${authors.length - maxShown} more` : "";
  return `${shown}${extra}`;
}
