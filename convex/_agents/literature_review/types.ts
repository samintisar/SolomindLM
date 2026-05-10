"use node";

import type { AcademicPaper } from "../../_services/search/AcademicSearchService";
import type { ActionCtx } from "../../_generated/server";

// ============================================================
// Column Types
// ============================================================

export interface TableColumn {
  id: string;
  name: string;
  type: "paper_title" | "authors" | "year" | "study_type" | "custom";
  instructions?: string;
  isVisible: boolean;
  isSystem: boolean;
  order: number;
}

export interface SuggestedColumn {
  id: string;
  name: string;
  instructions?: string;
}

export interface ConfirmedColumn extends SuggestedColumn {
  isVisible: boolean;
}

// ============================================================
// Paper Types
// ============================================================

export interface ScreenedPaper extends AcademicPaper {
  isIncluded: boolean;
  includeReason?: string;
}

export interface RankedPaper extends AcademicPaper {
  relevanceScore?: number;
  rank?: number;
}

// ============================================================
// Extraction Types
// ============================================================

export interface ExtractionResult {
  paperId: string;
  columnId: string;
  content: string;
}

export interface PaperExtraction {
  paperId: string;
  rowData: Record<string, string>;
  includeReason?: string;
  isIncluded: boolean;
}

// ============================================================
// Report Types
// ============================================================

export interface ReportSection {
  heading: string;
  content: string;
}

export interface LiteratureReviewPhase {
  phase: string;
  percentage: number;
  message: string;
}

// ============================================================
// Node Dependencies
// ============================================================

export interface LiteratureReviewNodeDeps {
  ctx?: ActionCtx;
  sessionId?: string;
  apiKey: string;
  smartModel: string;

  // Academic search
  searchPapers?: (
    query: string,
    maxResults?: number
  ) => Promise<AcademicPaper[]>;

  // Reranking
  rerankPapers?: (
    query: string,
    papers: AcademicPaper[]
  ) => Promise<RankedPaper[]>;

  // Progress callback
  onProgress?: (progress: LiteratureReviewPhase) => void;
}

// ============================================================
// Stream Chunk Types
// ============================================================

export type LiteratureReviewStreamChunk =
  | { type: "plan"; data: { suggestedColumns: SuggestedColumn[]; searchQueries: string[] } }
  | { type: "progress"; data: LiteratureReviewPhase }
  | { type: "screening"; data: { paperId: string; isIncluded: boolean; reason: string }[] }
  | { type: "extraction"; data: { paperId: string; columnId: string; content: string }[] }
  | { type: "table"; data: { tableId: string } }
  | { type: "report"; data: { reportId: string } }
  | { type: "error"; data: { message: string } }
  | { type: "done" };
