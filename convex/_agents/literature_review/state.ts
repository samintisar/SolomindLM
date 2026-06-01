"use node";
/**
 * State definitions for the literature review agent.
 *
 * Defines the LangGraph Annotation state used by any subgraphs
 * within the literature review workflow. Database remains the
 * source of truth; this is working memory for graph execution.
 */

import { Annotation } from "@langchain/langgraph";
import { mapOutputsMergeReducer } from "../_shared/stateUpdateHelpers.js";
import type {
  AcademicPaper,
  ExtractedData,
  LiteratureCitation,
  LiteratureReviewProgress,
  ScreenedPaper,
  TableColumn,
} from "./types";

// ============================================================
// REDUCER HELPERS
// ============================================================

function overwriteReducer<T>(x: T, y?: T): T {
  return y !== undefined ? y : x;
}

function mergeExtractedDataReducer(x: ExtractedData, y?: ExtractedData | null): ExtractedData {
  if (y === null) return {};
  if (y === undefined) return x;
  const merged: ExtractedData = { ...x };
  for (const [paperId, columns] of Object.entries(y)) {
    merged[paperId] = { ...merged[paperId], ...columns };
  }
  return merged;
}

// ============================================================
// STATE DEFINITION
// ============================================================

export const LiteratureReviewState = Annotation.Root({
  query: Annotation<string>({
    reducer: overwriteReducer,
    default: () => "",
  }),

  suggestedColumns: Annotation<TableColumn[]>({
    reducer: mapOutputsMergeReducer,
    default: () => [],
  }),

  confirmedColumns: Annotation<TableColumn[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  papers: Annotation<AcademicPaper[]>({
    reducer: mapOutputsMergeReducer,
    default: () => [],
  }),

  rankedPapers: Annotation<AcademicPaper[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  screenedPapers: Annotation<ScreenedPaper[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  extractedData: Annotation<ExtractedData>({
    reducer: mergeExtractedDataReducer,
    default: () => ({}),
  }),

  tableColumns: Annotation<TableColumn[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  citations: Annotation<LiteratureCitation[]>({
    reducer: mapOutputsMergeReducer,
    default: () => [],
  }),

  progress: Annotation<LiteratureReviewProgress>({
    reducer: overwriteReducer,
    default: () => ({
      phase: "initializing",
      percentage: 0,
      message: "Initializing literature review...",
    }),
  }),

  error: Annotation<string | undefined>({
    reducer: overwriteReducer,
    default: () => undefined,
  }),
});

export type LiteratureReviewStateType = typeof LiteratureReviewState.State;
