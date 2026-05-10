"use node";

import { Annotation } from "@langchain/langgraph";
import type { SuggestedColumn, ConfirmedColumn, ScreenedPaper, RankedPaper, TableColumn } from "./types";
import type { AcademicPaper } from "../../_services/search/AcademicSearchService";

/**
 * LangGraph Annotation state for the literature review agent.
 * This is working memory for graph execution; database is the source of truth.
 */

export const LiteratureReviewState = Annotation.Root({
  // User input
  query: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),

  // Search strategy (from planReview)
  searchQueries: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),

  // Column configuration (from planReview → user confirmation)
  suggestedColumns: Annotation<SuggestedColumn[]>({
    reducer: (_x: SuggestedColumn[], y?: SuggestedColumn[]) => y ?? _x,
    default: () => [],
  }),
  confirmedColumns: Annotation<ConfirmedColumn[]>({
    reducer: (_x: ConfirmedColumn[], y?: ConfirmedColumn[]) => y ?? _x,
    default: () => [],
  }),

  // Paper pipeline
  papers: Annotation<AcademicPaper[]>({
    reducer: (_x: AcademicPaper[], y?: AcademicPaper[]) => y ?? _x,
    default: () => [],
  }),
  rankedPapers: Annotation<RankedPaper[]>({
    reducer: (_x: RankedPaper[], y?: RankedPaper[]) => y ?? _x,
    default: () => [],
  }),
  screenedPapers: Annotation<ScreenedPaper[]>({
    reducer: (_x: ScreenedPaper[], y?: ScreenedPaper[]) => y ?? _x,
    default: () => [],
  }),

  // Extracted data: paperId -> columnId -> content
  extractedData: Annotation<Record<string, Record<string, string>>>({
    reducer: (_x, y?) => y ?? _x,
    default: () => ({}),
  }),

  // Output
  tableColumns: Annotation<TableColumn[]>({
    reducer: (_x: TableColumn[], y?: TableColumn[]) => y ?? _x,
    default: () => [],
  }),
  citations: Annotation<any[]>({
    reducer: (_x: any[], y?: any[]) => y ?? _x,
    default: () => [],
  }),
  tableId: Annotation<string | undefined>({
    reducer: (_x, y?) => y ?? _x,
    default: () => undefined,
  }),
  reportId: Annotation<string | undefined>({
    reducer: (_x, y?) => y ?? _x,
    default: () => undefined,
  }),

  // Progress tracking
  progress: Annotation<{ phase: string; percentage: number; message: string }>({
    reducer: (_x, y?) => y ?? _x,
    default: () => ({ phase: "planning", percentage: 0, message: "Starting literature review..." }),
  }),

  // Error state
  error: Annotation<string | undefined>({
    reducer: (_x, y?) => y ?? _x,
    default: () => undefined,
  }),

  // Context (injected at start, not modified by nodes)
  sessionId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  notebookId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  userId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
});

export type LiteratureReviewStateType = typeof LiteratureReviewState.State;
