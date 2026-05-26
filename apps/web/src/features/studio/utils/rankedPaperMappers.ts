import type { Citation } from "@convex/_utils/CitationEngine";
import type { RankedPaper } from "../types/rankedPaper";

export function rankedPaperToCitation(paper: RankedPaper, paperId: string): Citation {
  return {
    paperId,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    doi: paper.doi,
    url: paper.url,
    sourceApi: paper.source,
  };
}

/** Map ranked paper to bulk-upload paper_record shape. */
export function rankedPaperToBulkUpload(paper: RankedPaper) {
  const landingPageUrl =
    paper.url?.trim() ||
    (paper.doi
      ? `https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
      : undefined);

  return {
    title: paper.title,
    abstract: paper.abstract || "",
    authors: paper.authors,
    doi: paper.doi,
    publicationYear: paper.year,
    isOa: Boolean(paper.pdfUrl?.trim()),
    pdfUrl: paper.pdfUrl,
    landingPageUrl,
    sourceType: paper.source,
  };
}

export function isPaperInNotebook(
  paper: RankedPaper,
  existing: { dois: string[]; titleHashes: string[] }
): boolean {
  if (paper.doi) {
    const normalized = paper.doi.toLowerCase().trim();
    if (existing.dois.includes(normalized)) return true;
  }
  if (paper.title && paper.authors.length > 0) {
    const firstAuthor = paper.authors[0];
    const hash = `${paper.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
    if (existing.titleHashes.includes(hash)) return true;
  }
  return false;
}
