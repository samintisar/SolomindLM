// TypeScript type definitions for the literature review agent.
// Pure TypeScript — no "use node" directive.

import { z } from "zod";

// ============================================================
// ZOD SCHEMAS (for structured LLM output validation)
// ============================================================

/**
 * Schema for screening decisions output.
 */
export const ScreenPapersOutputSchema = z.object({
  decisions: z.array(
    z.object({
      paperId: z.string(),
      isIncluded: z.boolean(),
      reason: z.string(),
    })
  ),
});

export type ScreenPapersOutput = z.infer<typeof ScreenPapersOutputSchema>;

/**
 * Schema for data extraction output.
 */
export const ExtractDataOutputSchema = z.object({
  extractedData: z.record(z.string(), z.string()),
});

export type ExtractDataOutput = z.infer<typeof ExtractDataOutputSchema>;

/**
 * Schema for plan review output (search queries + suggested columns).
 */
export const PlanReviewOutputSchema = z.object({
  searchQueries: z.array(z.string()),
  suggestedColumns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.string().optional(),
      isVisible: z.boolean(),
    })
  ),
});

export type PlanReviewOutput = z.infer<typeof PlanReviewOutputSchema>;

// ============================================================
// CORE TYPES
// ============================================================

/**
 * Academic paper metadata returned from search APIs.
 */
export interface AcademicPaper {
  id: string;
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
}

/**
 * Paper with screening decision applied.
 */
export interface ScreenedPaper extends AcademicPaper {
  isIncluded: boolean;
  includeReason?: string;
}

/**
 * Column definition for the literature extraction table.
 */
export interface TableColumn {
  id: string;
  name: string;
  instructions?: string;
  isVisible: boolean;
  type?: "paper_title" | "authors" | "year" | "study_type" | "custom";
  isSystem?: boolean;
  order?: number;
}

/**
 * Extracted cell data: paperId -> columnId -> content.
 */
export type ExtractedData = Record<string, Record<string, string>>;

// ============================================================
// WORKFLOW INPUT / OUTPUT
// ============================================================

/**
 * Input payload to start a literature review workflow.
 */
export interface LiteratureReviewInput {
  query: string;
  notebookId: string;
  userId: string;
  sessionId: string;
}

/**
 * Final output from a completed literature review workflow.
 */
export interface LiteratureReviewOutput {
  tableId: string;
  reportId: string;
}

// ============================================================
// PROGRESS & INTERNAL
// ============================================================

/**
 * Progress update structure streamed to the client.
 */
export interface LiteratureReviewProgress {
  phase: string;
  percentage: number;
  message: string;
}

/**
 * Search query plan produced during the planning phase.
 */
export interface SearchPlan {
  searchQueries: string[];
  suggestedColumns: TableColumn[];
}

/**
 * Screening decision for a single paper.
 */
export interface ScreeningDecision {
  paperId: string;
  isIncluded: boolean;
  reason: string;
}

/**
 * Batch screening result JSON shape.
 */
export interface ScreeningResult {
  decisions: ScreeningDecision[];
}

/**
 * Data extraction result for a single paper.
 */
export interface ExtractionResult {
  extractedData: Record<string, string>;
}

/**
 * Citation metadata used for inline references and bibliographies.
 */
export interface LiteratureCitation {
  paperId: string;
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url: string;
  sourceApi: "arxiv" | "semantic_scholar" | "pubmed";
}
