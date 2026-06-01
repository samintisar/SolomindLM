"use node";

import { Annotation } from "@langchain/langgraph";
import type { EvidenceEntry, Gap, SourcePolicy, SubQuestion } from "./types";

// LangGraph Annotation state for the research agent.
// Database is the source of truth; this is working memory for graph execution.

export const ResearchState = Annotation.Root({
  // From plan (set once at start)
  query: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  subQuestions: Annotation<SubQuestion[]>({
    reducer: (_x: SubQuestion[], y?: SubQuestion[]) => y ?? _x,
    default: () => [],
  }),
  sourcePolicy: Annotation<SourcePolicy>({
    reducer: (_x: SourcePolicy, y?: SourcePolicy) => y ?? _x,
    default: () => ({ channels: ["notebook"] }),
  }),

  // Execution state (accumulated during graph run)
  evidence: Annotation<EvidenceEntry[]>({
    reducer: (x: EvidenceEntry[], y?: EvidenceEntry[]) => (y ? [...x, ...y] : x),
    default: () => [],
  }),
  gaps: Annotation<Gap[]>({
    reducer: (_x: Gap[], y?: Gap[]) => y ?? _x,
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 2,
  }),

  // Context
  conversationHistory: Annotation<Array<{ role: string; content: string }>>({
    reducer: (_x, y?) => y ?? _x,
    default: () => [],
  }),
  documentIds: Annotation<string[] | undefined>({
    reducer: (_x, y?) => y ?? _x,
    default: () => undefined,
  }),
  notebookId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
  userId: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),

  // Stop function output
  shouldStop: Annotation<boolean>({
    reducer: (_x: boolean, y?: boolean) => y ?? _x,
    default: () => false,
  }),
  stopReason: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),

  // Writer output
  finalResponse: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => "",
  }),
});

export type ResearchStateType = typeof ResearchState.State;
