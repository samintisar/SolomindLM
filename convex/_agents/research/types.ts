"use node";

// TypeScript types for the deep research agent.

export interface SubQuestion {
  id: string;
  question: string;
  searchQueries: string[];
  sourceChannels: SourceChannel[];
  status: SubQuestionStatus;
}

export type SourceChannel = "notebook" | "web" | "academic" | "news";
export type SubQuestionStatus = "pending" | "researching" | "completed";

export interface SourcePolicy {
  channels: SourceChannel[];
  domainAllowlist?: string[];
  dateRange?: { start: number; end: number };
  maxResultsPerChannel?: number;
  credibilityTier?: "primary" | "secondary" | "any";
  requirePrimarySources?: boolean;
  recencyDays?: number;
  dedupeStrategy?: "strict" | "semantic" | "off";
}

export interface EvidenceEntry {
  subQuestionId: string;
  sourceType: SourceChannel;
  sourceTitle: string;
  sourceUrl?: string;
  content: string;
  relevanceScore?: number;
  credibilityTier?: string;
  iteration: number;
  metadata?: {
    documentId?: string;
    chunkIndex?: number;
    domain?: string;
    publishedAt?: number;
    doi?: string;
    citationCount?: number;
  };
}

export interface Gap {
  subQuestionId: string;
  reason: string;
  suggestedQueries: string[];
  priority: "high" | "medium" | "low";
}

export interface ResearchPlan {
  query: string;
  subQuestions: SubQuestion[];
  sourcePolicy: SourcePolicy;
}

export interface ResearchContext {
  userId: string;
  notebookId: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds?: string[];
}

// Research-specific stream chunk types (extends ChatAgent StreamChunk)
export type ResearchStreamChunk =
  | {
      type: "research_plan";
      data: { planId: string; subQuestions: SubQuestion[]; sourcePolicy: SourcePolicy };
    }
  | {
      type: "research_progress";
      data: {
        phase: ResearchPhase;
        subQuestionId?: string;
        iteration: number;
        sourcesFound: number;
      };
    }
  | /** Raw evidence for persisting to `researchEvidence` (streamed before tokens) */ {
      type: "evidence";
      data: EvidenceEntry[];
    }
  | { type: "token"; data: string }
  | { type: "references"; data: unknown[] }
  | { type: "status"; status: string; message?: string }
  | { type: "error"; data: { message: string; type: string } }
  | { type: "done" };

export type ResearchPhase =
  | "planning"
  | "retrieving_notebook"
  | "retrieving_web"
  | "synthesizing"
  | "gap_analysis"
  | "writing";
