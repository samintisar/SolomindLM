/**
 * Academic paper from external APIs (arXiv, Semantic Scholar, PubMed)
 */
export interface AcademicPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: "arxiv" | "semantic_scholar" | "pubmed";
  citationCount?: number;
  doi?: string;
  score: number;
  /** From Semantic Scholar when available */
  fieldsOfStudy?: string[];
}

/**
 * Normalized discovery source format for consumers
 */
export interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  domain?: string;
  rawContent?: string;
  metadata?: {
    pdfUrl?: string;
    doi?: string;
    citationCount?: number;
    sourceApi?: "arxiv" | "semantic_scholar" | "pubmed";
    fieldsOfStudy?: string[];
  };
}

/**
 * Filter options for academic searches
 */
export interface AcademicSearchFilters {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  fieldsOfStudy?: string[];
}

/**
 * Arguments for the internal search handler
 */
export interface SearchInternalArgs {
  query: string;
  maxResults: number;
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  fieldsOfStudy?: string[];
  /** Default merges arXiv + Semantic Scholar + PubMed */
  provider?: "all" | "pubmed" | "arxiv";
  sortBy?: string;
}

/**
 * Arguments for discovering academic papers
 */
export interface DiscoverAcademicPapersArgs {
  query: string;
  maxResults?: number;
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  fieldsOfStudy?: string[];
  provider?: "all" | "pubmed" | "arxiv";
  sortBy?: string;
}
