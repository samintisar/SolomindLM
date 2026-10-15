import type { EvidenceEntry, Gap, SourcePolicy, SubQuestion } from "./types";

// Working memory for one research run. The database is the source of truth.
// Nodes return a Partial<ResearchStateType>; graph.ts applies it by hand. runPlanGraph reads the
// planner's subQuestions directly. runExecuteGraph appends the retriever's evidence (and takes its
// subQuestions), then spreads the writer's result over the state — so a node must omit a field it
// does not set, because an explicit `undefined` would overwrite it.
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
