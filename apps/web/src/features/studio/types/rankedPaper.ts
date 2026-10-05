export type RankedPaperSource = "openalex" | "arxiv" | "semantic_scholar" | "pubmed";

/** Where a table paper came from: a database search, or the user's own notebook (#301). */
export type PaperCitationSource = RankedPaperSource | "notebook";

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

export function sourceLabel(source: PaperCitationSource): string {
  switch (source) {
    case "arxiv":
      return "arXiv (Cornell University)";
    case "semantic_scholar":
      return "Semantic Scholar";
    case "pubmed":
      return "PubMed";
    case "openalex":
      return "OpenAlex";
    case "notebook":
      return "Your notebook";
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
