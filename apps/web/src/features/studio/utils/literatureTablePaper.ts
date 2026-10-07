import type { TableColumn } from "../components/ColumnManager";
import type { PaperCitationSource, RankedPaper } from "../types/rankedPaper";
import { formatAuthorsLine, sourceLabel } from "../types/rankedPaper";

export interface TablePaperCitation {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url: string;
  pdfUrl?: string;
  sourceApi: PaperCitationSource;
  /** The notebook source a "notebook" citation came from. */
  documentId?: string;
  citationCount?: number;
  abstract?: string;
}

export interface TablePaperRow {
  citationId: string;
  rowData: Record<string, string>;
  includeReason?: string;
  isIncluded: boolean;
  /** Set on a notebook paper the screening check judged off-topic; it is still included. */
  offTopicReason?: string;
  /** Set when the extraction call failed, so the row's columns are empty for that reason. */
  extractionFailed?: boolean;
  citation: TablePaperCitation | null;
}

export function citationToRankedPaper(citation: TablePaperCitation): RankedPaper {
  return {
    title: citation.title,
    authors: citation.authors,
    year: citation.year,
    abstract: citation.abstract ?? "",
    url: citation.url,
    pdfUrl: citation.pdfUrl,
    // Citation styles only treat arXiv differently; a notebook paper is cited as an article.
    source: citation.sourceApi === "notebook" ? "openalex" : citation.sourceApi,
    citationCount: citation.citationCount,
    doi: citation.doi,
    score: 0,
  };
}

export function tableCitationToBulkUpload(citation: TablePaperCitation) {
  const landingPageUrl =
    citation.url?.trim() ||
    (citation.doi
      ? `https://doi.org/${citation.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
      : undefined);

  return {
    title: citation.title,
    abstract: citation.abstract || "",
    authors: citation.authors,
    doi: citation.doi,
    publicationYear: citation.year,
    isOa: Boolean(citation.pdfUrl?.trim()),
    pdfUrl: citation.pdfUrl,
    landingPageUrl,
    sourceType: citation.sourceApi,
  };
}

export function isTablePaperInNotebook(
  citation: TablePaperCitation,
  existing: { dois: string[]; titleHashes: string[] }
): boolean {
  if (citation.doi) {
    const normalized = citation.doi.toLowerCase().trim();
    if (existing.dois.includes(normalized)) return true;
  }
  if (citation.title && citation.authors.length > 0) {
    const firstAuthor = citation.authors[0];
    const hash = `${citation.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
    if (existing.titleHashes.includes(hash)) return true;
  }
  return false;
}

export function getPaperTitle(paper: TablePaperRow, columns: TableColumn[]): string {
  if (paper.citation?.title) return paper.citation.title;
  const titleCol = columns.find((c) => c.type === "paper_title");
  if (titleCol && paper.rowData[titleCol.id]) return paper.rowData[titleCol.id];
  return "Untitled Paper";
}

const STUDY_TYPE_COLUMN_NAME =
  /study\s*type|study\s*design|paper\s*type|publication\s*type|article\s*type/i;
const STUDY_TYPE_COLUMN_ID = /study_type|study_design|paper_type|publication_type/i;

function isStudyTypeColumn(col: TableColumn): boolean {
  if (col.type === "study_type") return true;
  const name = col.name.toLowerCase();
  const id = col.id.toLowerCase();
  return STUDY_TYPE_COLUMN_NAME.test(name) || STUDY_TYPE_COLUMN_ID.test(id);
}

function splitStudyTypeParts(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== "n/a");
}

function addStudyTypeLabel(labels: string[], candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed) return;
  if (labels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) return;
  labels.push(trimmed);
}

/** Labels for paper-type pills in the Papers column (extracted data + title/abstract inference). */
export function collectStudyTypeLabels(paper: TablePaperRow, columns: TableColumn[]): string[] {
  const labels: string[] = [];

  for (const col of columns) {
    if (!isStudyTypeColumn(col)) continue;
    const raw = paper.rowData[col.id]?.trim();
    if (!raw) continue;
    for (const part of splitStudyTypeParts(raw)) {
      addStudyTypeLabel(labels, part);
    }
  }

  for (const [key, raw] of Object.entries(paper.rowData)) {
    if (!STUDY_TYPE_COLUMN_ID.test(key)) continue;
    const value = raw?.trim();
    if (!value) continue;
    for (const part of splitStudyTypeParts(value)) {
      addStudyTypeLabel(labels, part);
    }
  }

  if (labels.length === 0) {
    const inferred = inferStudyTypeLabel(paper);
    if (inferred) addStudyTypeLabel(labels, inferred);
  }

  return labels.slice(0, 3);
}

export function inferStudyTypeLabel(paper: TablePaperRow): string | null {
  const title = paper.citation?.title ?? paper.rowData["title"] ?? "";
  const abstract = paper.citation?.abstract ?? paper.rowData["summary"] ?? "";
  const text = `${title} ${abstract}`.toLowerCase();

  if (/\bsystematic review\b|\bmeta-analysis\b|\bmeta analysis\b/.test(text)) {
    return "Systematic Review";
  }
  if (/\bliterature review\b|\bnarrative review\b|\bscoping review\b/.test(text)) {
    return "Literature Review";
  }
  if (
    /\brandomized controlled\b|\brandomised controlled\b|\bcontrolled trial\b|\brct\b/.test(text)
  ) {
    return "Randomized controlled trial";
  }
  if (/\bobservational\b|\bcohort study\b|\bcase-control\b|\bcross-sectional\b/.test(text)) {
    return "Observational study";
  }
  if (/\bbenchmark\b|\bleaderboard\b|\baudit(ing)?\b|\bempirical evaluation\b/.test(text)) {
    return "Empirical study";
  }
  return null;
}

export function formatPaperMetaLine(citation: TablePaperCitation): string {
  const source = sourceLabel(citation.sourceApi);
  const parts = [
    source,
    citation.citationCount != null ? `${citation.citationCount.toLocaleString()} Citations` : null,
    citation.year != null ? String(citation.year) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatPaperAuthors(citation: TablePaperCitation): string {
  return formatAuthorsLine(citation.authors, 3);
}

const STUDY_TYPE_ICON_MATCHERS: Array<{ match: RegExp; kind: StudyTypePillIcon }> = [
  { match: /systematic review|meta-analysis|meta analysis/i, kind: "systematic" },
  { match: /literature review|narrative review|scoping review/i, kind: "literature" },
  { match: /randomized|rct|controlled trial/i, kind: "trial" },
  { match: /observational|cohort|case-control|cross-sectional/i, kind: "observational" },
  { match: /empirical|benchmark|evaluation/i, kind: "empirical" },
];

export type StudyTypePillIcon =
  | "systematic"
  | "literature"
  | "trial"
  | "observational"
  | "empirical"
  | "default";

/** The icon for a study-type badge; the badge's look comes from `Badge`. */
export function studyTypeIcon(label: string): StudyTypePillIcon {
  return STUDY_TYPE_ICON_MATCHERS.find((entry) => entry.match.test(label))?.kind ?? "default";
}

/** System columns rendered inside the Papers column — not as separate grid columns. */
const SYSTEM_COLUMN_TYPES = new Set(["paper_title", "authors", "year", "study_type"]);

export function isDataColumn(col: TableColumn): boolean {
  return col.isVisible && !SYSTEM_COLUMN_TYPES.has(col.type);
}
