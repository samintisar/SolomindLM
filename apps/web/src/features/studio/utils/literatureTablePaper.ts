import type { TableColumn } from "../components/ColumnManager";
import type { RankedPaper, RankedPaperSource } from "../types/rankedPaper";
import { formatAuthorsLine, sourceLabel } from "../types/rankedPaper";

export interface TablePaperCitation {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url: string;
  pdfUrl?: string;
  sourceApi: RankedPaperSource;
  citationCount?: number;
  abstract?: string;
}

export interface TablePaperRow {
  citationId: string;
  rowData: Record<string, string>;
  includeReason?: string;
  isIncluded: boolean;
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
    source: citation.sourceApi,
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

/** @deprecated Use collectStudyTypeLabels */
export function getStudyTypeLabel(paper: TablePaperRow, columns: TableColumn[]): string | null {
  const labels = collectStudyTypeLabels(paper, columns);
  return labels[0] ?? null;
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
  if (/\brandomized controlled\b|\brandomised controlled\b|\bcontrolled trial\b|\brct\b/.test(text)) {
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

const STUDY_TYPE_PILL_CLASS =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 font-sans text-[11px] font-medium leading-tight text-muted-foreground";

const STUDY_TYPE_PILL_ICON_CLASS = "text-muted-foreground";

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

export interface StudyTypePillStyle {
  className: string;
  iconClassName: string;
  icon: StudyTypePillIcon;
}

export function getStudyTypePillStyle(label: string): StudyTypePillStyle {
  const kind =
    STUDY_TYPE_ICON_MATCHERS.find((entry) => entry.match.test(label))?.kind ?? "default";
  return {
    className: STUDY_TYPE_PILL_CLASS,
    iconClassName: STUDY_TYPE_PILL_ICON_CLASS,
    icon: kind,
  };
}

/** @deprecated Use getStudyTypePillStyle */
export function studyTypePillClass(label: string): string {
  return getStudyTypePillStyle(label).className;
}

/** @deprecated Use getStudyTypePillStyle */
export function studyTypePillIcon(label: string): StudyTypePillIcon {
  return getStudyTypePillStyle(label).icon;
}

/** System columns rendered inside the Papers column — not as separate grid columns. */
export const SYSTEM_COLUMN_TYPES = new Set([
  "paper_title",
  "authors",
  "year",
  "study_type",
]);

export function isDataColumn(col: TableColumn): boolean {
  return col.isVisible && !SYSTEM_COLUMN_TYPES.has(col.type);
}
