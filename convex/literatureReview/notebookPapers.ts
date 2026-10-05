/**
 * Notebook papers in a literature review (#301): which notebook sources count as papers, how they
 * become the workflow's paper shape, and how search copies of them are dropped. Notebook papers
 * skip screening and are always included.
 */

/** Characters of a notebook paper's own text used for extraction (search papers get an abstract). */
export const NOTEBOOK_PAPER_TEXT_MAX_CHARS = 12_000;

/** Characters used as an abstract stand-in for an uploaded PDF without a summary. */
const NOTEBOOK_PAPER_ABSTRACT_MAX_CHARS = 1_200;

export const NOTEBOOK_PAPER_INCLUDE_REASON = "From your notebook";

interface PaperRecordLike {
  abstract?: string;
  authors?: string[];
  doi?: string;
  publicationYear?: number;
  pdfUrl?: string;
  landingPageUrl?: string;
}

export interface NotebookDocumentLike {
  _id: string;
  fileName: string;
  fileType: string;
  status?: string;
  contentType?: string;
  fileUrl?: string;
  paperRecord?: PaperRecordLike;
  sourceGuide?: { summary?: string };
  extractedMarkdown?: string;
}

/** Metadata read from an uploaded PDF's first page. */
export interface PdfMetadata {
  title?: string;
  authors?: string[];
  year?: number;
}

export interface NotebookPaper {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  url: string;
  pdfUrl?: string;
  source: "notebook";
  doi?: string;
  score: number;
  isIncluded: true;
  includeReason: string;
  documentId: string;
}

/** A saved paper record, or a finished upload that is a PDF. */
export function isNotebookPaperDocument(
  doc: Pick<NotebookDocumentLike, "fileType" | "fileName" | "status" | "contentType">
): boolean {
  if (doc.status !== "completed") return false;
  if (doc.fileType === "paper_record") return true;
  if (doc.fileType !== "file") return false;
  return (
    doc.contentType?.toLowerCase() === "application/pdf" ||
    doc.fileName.toLowerCase().endsWith(".pdf")
  );
}

function startOfText(text: string | undefined, maxChars: number): string {
  return (text ?? "").trim().slice(0, maxChars);
}

export function notebookPaperFromDocument(
  doc: NotebookDocumentLike,
  pdfMetadata: PdfMetadata = {}
): NotebookPaper {
  const record = doc.paperRecord;
  const title = pdfMetadata.title?.trim() || doc.fileName;
  return {
    title,
    authors: record?.authors?.length ? record.authors : (pdfMetadata.authors ?? []),
    year: record?.publicationYear ?? pdfMetadata.year,
    abstract:
      record?.abstract?.trim() ||
      doc.sourceGuide?.summary?.trim() ||
      startOfText(doc.extractedMarkdown, NOTEBOOK_PAPER_ABSTRACT_MAX_CHARS),
    url: record?.landingPageUrl || doc.fileUrl || record?.pdfUrl || "",
    ...(record?.pdfUrl ? { pdfUrl: record.pdfUrl } : {}),
    ...(record?.doi ? { doi: record.doi } : {}),
    source: "notebook",
    score: 1,
    isIncluded: true,
    includeReason: NOTEBOOK_PAPER_INCLUDE_REASON,
    documentId: doc._id,
  };
}

/** The text extraction reads for a notebook paper: its own text, or its abstract. */
export function notebookPaperText(
  doc: Pick<NotebookDocumentLike, "extractedMarkdown" | "paperRecord">
): string {
  const text = startOfText(doc.extractedMarkdown, NOTEBOOK_PAPER_TEXT_MAX_CHARS);
  return text || (doc.paperRecord?.abstract ?? "").trim();
}

function firstAuthorKey(authors: string[]): string {
  const first = authors[0]?.split(",")[0] ?? "";
  return (first.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Drop search results that are copies of notebook papers (same DOI, or same title and first author). */
export function dropSearchCopiesOfNotebookPapers<
  T extends { title: string; authors: string[]; doi?: string },
>(notebook: Array<{ title: string; authors: string[]; doi?: string }>, search: T[]): T[] {
  if (notebook.length === 0) return search;
  const dois = new Set(notebook.flatMap((p) => (p.doi ? [p.doi.toLowerCase().trim()] : [])));
  const titles = new Set(notebook.map((p) => `${titleKey(p.title)}|${firstAuthorKey(p.authors)}`));
  return search.filter((p) => {
    const doi = p.doi?.toLowerCase().trim();
    if (doi && dois.has(doi)) return false;
    return !titles.has(`${titleKey(p.title)}|${firstAuthorKey(p.authors)}`);
  });
}

export type PaperScope = "papers_and_search" | "papers_only";

/**
 * The review's scope given how many selected sources are papers: searching as well by default,
 * search only when none are papers. Papers-only with no papers is an error.
 */
export function resolvePaperScope(
  paperCount: number,
  requested: PaperScope | undefined
): PaperScope | undefined {
  if (paperCount === 0) {
    if (requested === "papers_only") {
      throw new Error("Select at least one PDF or saved paper to review only your papers.");
    }
    return undefined;
  }
  return requested ?? "papers_and_search";
}
