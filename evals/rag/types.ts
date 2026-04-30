/**
 * Shared types for the RAG evaluation pipeline.
 *
 * Schema follows the plan: fixture → runner → metrics → report flow.
 * All metric rows are tagged by runner, configHash, and caseId for grouping.
 */

// ─── Fixtures ────────────────────────────────────────────────

/** Studio agent kinds that can be evaluated. Each corresponds to a Convex eval action. */
export type StudioRunnerKind =
  | "report"
  | "flashcards"
  | "quiz"
  | "mindmap"
  | "slides"
  | "spreadsheet"
  | "writtenQuestions"
  | "audioScript";

/** All runner kinds (RAG + studio). `"both"` is a fixture-side directive that expands into multiple runs. */
export type RunnerKind = "chat" | "research" | "both" | StudioRunnerKind;

/** Concrete runner emitted on artifacts/metrics (no `"both"`). */
export type ConcreteRunnerKind = "chat" | "research" | StudioRunnerKind;

/**
 * Optional studio-specific generation parameters threaded through to the
 * underlying studio job. Field names match the args of the corresponding
 * `convex/studio/scheduling/<type>.ts` action.
 */
export interface StudioParams {
  reportType?: string;
  customPrompt?: string;
  cardCount?: number;
  difficulty?: string;
  topic?: string;
  questionCount?: number;
  slideCount?: number;
}

export interface SourcePolicyConfig {
  channels: string[];
  maxResultsPerChannel?: number;
  domainAllowlist?: string[];
  recencyDays?: number;
}

/**
 * Optional structural expectations used by studio metric scorers.
 * `requiredSections`: heading text that must appear in a markdown report.
 * `minItems`: minimum count for cards/questions/nodes/slides/rows.
 * `jsonShape`: which Zod-style validator to apply (only for structured outputs).
 */
export interface ExpectedStructure {
  minItems?: number;
  requiredSections?: string[];
  jsonShape?: "mindmap" | "slides" | "spreadsheet";
}

export interface EvalFixture {
  /** Bump when fixture shape or expected items change */
  schemaVersion: number;
  /** Unique case identifier, e.g. "agentic-patterns-20" */
  id: string;
  /** The user question sent to the agent (for studio runners: the generation prompt/topic) */
  question: string;
  /** Items that must appear in the answer (for deterministic metrics) */
  expectedItems: string[];
  /**
   * Expected answer text for LLM-judge evaluation.
   * Used when expectedItems is insufficient (e.g., prose explanations).
   */
  expectedAnswer?: string;
  /** Higher-level behavioral expectation (free text for LLM judge) */
  expectedBehavior: string;
  /** Which runner to use */
  runner: RunnerKind;
  /** Optional notebook / document ids to scope retrieval */
  notebookId?: string;
  documentIds?: string[];
  /** Tags for grouping in reports (include scenario category) */
  tags: string[];
  /** Explicit scenario category (optional: inferred from tags if not set) */
  scenarioCategory?:
    | "factoid"
    | "list-enumeration"
    | "comparison"
    | "causality"
    | "temporal"
    | "ambiguous"
    | "multi-doc"
    | "technical"
    | "summarization"
    | "explanation";
  /** Studio-only: parameters forwarded to the generation job */
  studioParams?: StudioParams;
  /** Studio-only: structural expectations used by studio metric scorers */
  expectedStructure?: ExpectedStructure;
  /** Source filter configuration for testing retrieval across different channels */
  sourcePolicy?: SourcePolicyConfig;
}

// ─── Runner Artifacts ────────────────────────────────────────

/**
 * A single chunk snapshot at a specific retrieval stage.
 * Captured pre-rerank, post-rerank, and post-context-selection.
 */
export interface ChunkSnapshot {
  id: string;
  sourceTitle: string;
  sourceUrl?: string;
  content: string;
  similarity?: number;
  rrfScore?: number;
  vectorRank?: number;
  keywordRank?: number;
  /** Relevance score used for context selection thresholding */
  rankingScore?: number;
}

/**
 * Studio output payload attached to an artifact when the runner is a studio kind.
 * `raw` holds the structured row contents (cards array, slide list, mindmap tree, etc.).
 * Metric scorers read this to compute structural metrics; the serialized
 * text representation is stored on `EvalRunArtifact.answer` so existing
 * recall/judge metrics work unchanged.
 */
export interface StudioOutput {
  kind: StudioRunnerKind;
  raw: unknown;
}

/** Artifact captured by an eval runner for a single case */
export interface EvalRunArtifact {
  /** Which case this artifact belongs to */
  caseId: string;
  /** Concrete runner kind (no `"both"`) */
  runner: ConcreteRunnerKind;
  /** Stable hash of retrieval config (thresholds, budgets, rerank settings) */
  configHash: string;
  /** The generated answer text (or serialized studio output) */
  answer: string;
  /** Citations extracted from the answer */
  citations: string[];
  /** Chunks as returned by vector/keyword search, before rerank */
  preRerankChunks: ChunkSnapshot[];
  /** Chunks after rerank (ZeroEntropy or RRF-only) */
  postRerankChunks: ChunkSnapshot[];
  /** Chunks selected by token-budget context selection */
  selectedChunks: ChunkSnapshot[];
  /** Sub-queries generated by the agent (chat: retrieval subqueries, research: plan sub-questions) */
  subQueries: string[];
  /** Research plan (research runner only) */
  researchPlan?: {
    query: string;
    subQuestions: Array<{ id: string; question: string }>;
  };
  /** Research evidence entries (research runner only) */
  evidence?: Array<{
    subQuestionId: string;
    sourceTitle: string;
    relevanceScore: number;
    content: string;
  }>;
  /** Studio-only: structured output payload */
  studioOutput?: StudioOutput;
  /** Source policy used for this run */
  sourcePolicy?: SourcePolicyConfig;
  /** Per-source-type evidence found (research runner only) */
  sourceEvidence?: Array<{
    channel: string;
    sourceCount: number;
    topDomains?: string[];
  }>;
  /** Latency in ms */
  latencyMs: number;
  /** Token usage if available */
  tokenUsage?: { prompt: number; completion: number; total: number };
  /** Timestamp */
  timestamp: string;
}

// ─── Metrics ─────────────────────────────────────────────────

export type MetricStatus = "pass" | "fail" | "warn" | "info";

export interface MetricResult {
  /** Metric name, e.g. "expected_item_recall" */
  metric: string;
  caseId: string;
  runner: ConcreteRunnerKind;
  configHash: string;
  status: MetricStatus;
  /** Numeric score if applicable (0-1 for most metrics) */
  score: number;
  /** Human-readable detail */
  detail: string;
  /** Items/values that contributed to the score */
  breakdown?: Record<string, unknown>;
}

// ─── Reports ─────────────────────────────────────────────────

export type FailureCategory =
  | "retrieval"
  | "context_selection"
  | "prompt_answering"
  | "citation"
  | "research_planning"
  | "latency_cost";

export interface FailureGroup {
  category: FailureCategory;
  cases: Array<{
    caseId: string;
    runner: ConcreteRunnerKind;
    failures: MetricResult[];
    traceHints?: string[];
  }>;
  /** Suggested fix scope for a coding agent */
  suggestedFix: string;
  /** Files most likely to need changes */
  targetFiles: string[];
}

export interface EvalReport {
  /** ISO timestamp */
  timestamp: string;
  /** Commit SHA */
  commitSha: string;
  /** Number of cases run */
  totalCases: number;
  /** Overall pass/fail counts */
  summary: { pass: number; fail: number; warn: number; info: number };
  /** All metric results */
  metrics: MetricResult[];
  /** Grouped failures for coding agent consumption */
  failureGroups: FailureGroup[];
}

// ─── Config Hash ─────────────────────────────────────────────

/** Config values that are hashed into configHash */
export interface RetrievalConfigSnapshot {
  contextTokenBudget: number;
  minRelevanceThreshold: number;
  maxChunksHardLimit: number;
  vectorMatchThreshold: number;
  vectorMatchCount: number;
  rerankThreshold: number;
  rerankTopN: number;
  maxResults: number;
  keywordMatchCount: number;
  rrfK: number;
  enableHybrid: boolean;
  hybridThreshold: number;
}

// ─── Baselines ──────────────────────────────────────────────────

/** Baseline metrics for a specific case, used for latency/cost budget gating. */
export interface EvalBaseline {
  caseId: string;
  runner: string;
  configHash: string;
  latencyMs: number;
  tokenUsage: { prompt: number; completion: number; total: number };
  committedAt: string;
}
