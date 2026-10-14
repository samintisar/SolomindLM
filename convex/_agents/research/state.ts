import type { EvidenceEntry, Gap, SourcePolicy, SubQuestion } from "./types";

// Working memory for one research run. The database is the source of truth.
// Nodes return a Partial<ResearchStateType>; graph.ts merges it into the running state
// (evidence is appended, every other field is replaced).
export interface ResearchStateType {
  // From plan (set once at start)
  query: string;
  subQuestions: SubQuestion[];
  sourcePolicy: SourcePolicy;

  // Execution state (accumulated during the run)
  evidence: EvidenceEntry[];
  gaps: Gap[];
  iteration: number;
  maxIterations: number;

  // Context
  conversationHistory: Array<{ role: string; content: string }>;
  documentIds: string[] | undefined;
  notebookId: string;
  userId: string;

  // Stop function output
  shouldStop: boolean;
  stopReason: string;

  // Writer output
  finalResponse: string;
}
