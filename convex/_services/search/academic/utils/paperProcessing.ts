import { AcademicPaper, DiscoveredSource } from "../types";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateScore(paper: Omit<AcademicPaper, "score">): number {
  const rawCitations = paper.citationCount ?? 0;
  const citationScore = rawCitations > 0 ? Math.min(Math.log10(rawCitations + 1) / 3, 1) : 0.3;
  const currentYear = new Date().getFullYear();
  const age = paper.year ? Math.max(0, currentYear - paper.year) : 5;
  const recencyScore = Math.max(0.5, 1 - age * 0.05);
  return citationScore * 0.5 + recencyScore * 0.5;
}

export function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function yearToDateString(year: number | undefined): string | undefined {
  return year ? `${year}-01-01` : undefined;
}

export function toDiscoveredSource(paper: AcademicPaper): DiscoveredSource {
  return {
    title: paper.title,
    url: paper.url,
    snippet: paper.abstract.substring(0, 500),
    score: paper.score,
    publishedDate: yearToDateString(paper.year),
    domain: extractDomain(paper.url),
    rawContent: paper.abstract,
    metadata: {
      pdfUrl: paper.pdfUrl,
      doi: paper.doi,
      citationCount: paper.citationCount,
      sourceApi: paper.source,
      fieldsOfStudy: paper.fieldsOfStudy,
    },
  };
}

export function deduplicatePapers(papers: AcademicPaper[]): AcademicPaper[] {
  const seen = new Set<string>();
  return papers.filter((paper) => {
    const key = paper.doi ? paper.doi.toLowerCase() : normalizeTitle(paper.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterPapers(
  papers: AcademicPaper[],
  filters: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
    fieldsOfStudy?: string[];
  }
): AcademicPaper[] {
  const wantedFields = filters.fieldsOfStudy?.filter(Boolean).map((f) => f.toLowerCase());
  return papers.filter((paper) => {
    if (filters.publicationYearFrom && (paper.year ?? 0) < filters.publicationYearFrom) {
      return false;
    }
    if (filters.publicationYearTo && (paper.year ?? 9999) > filters.publicationYearTo) {
      return false;
    }
    if (filters.minCitations && (paper.citationCount ?? 0) < filters.minCitations) {
      return false;
    }
    if (filters.openAccessOnly && !paper.pdfUrl) {
      return false;
    }
    if (filters.hasFullText && !paper.pdfUrl?.trim()) {
      return false;
    }
    if (wantedFields && wantedFields.length > 0) {
      const pf = paper.fieldsOfStudy?.map((x) => x.toLowerCase()) ?? [];
      if (pf.length > 0 && !pf.some((x) => wantedFields.includes(x))) {
        return false;
      }
    }
    return true;
  });
}

export function sortPapers(papers: AcademicPaper[], sortBy: string): AcademicPaper[] {
  const sorted = [...papers];
  if (sortBy === "citations") {
    sorted.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  } else {
    sorted.sort((a, b) => b.score - a.score);
  }
  return sorted;
}
