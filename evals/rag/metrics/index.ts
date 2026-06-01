/**
 * Deterministic eval metrics for the RAG evaluation pipeline.
 *
 * Every function is pure TypeScript with no external dependencies.
 * Each metric returns MetricResult[] suitable for direct inclusion in an EvalReport.
 */
import type {
  EvalBaseline,
  EvalFixture,
  EvalRunArtifact,
  MetricResult,
  MetricStatus,
} from "../types";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Synonym mappings for common agentic pattern name variations.
 * Maps canonical names to alternative names the LLM might use.
 */
const SYNONYM_MAPPINGS: Record<string, string[]> = {
  routing: ["tool selection", "tool use", "router", "routing", "intelligent routing"],
  parallelization: ["parallel workers", "parallel", "parallelization", "multi-worker"],
  "learning and adaptation": ["feedback loop", "adaptation", "learning", "continuous improvement"],
  "resource-aware optimization": [
    "resource aware",
    "resource optimization",
    "routing by complexity",
  ],
  prioritization: ["task scoring", "triage", "priority", "task prioritization", "scoring"],
  "multi-agent collaboration": [
    "multi agent",
    "multi-agent",
    "agent collaboration",
    "orchestration",
  ],
  "memory management": ["memory", "long-term memory", "memory systems"],
  "human in the loop": ["human in the loop", "human-in-the-loop", "human intervention", "hitl"],
  "guardrails and safety patterns": ["guardrails", "safety", "safety patterns", "security"],
  "goal setting and monitoring": ["goal setting", "goal monitoring", "smart goals", "planning"],
  "exception handling and recovery": [
    "exception handling",
    "error handling",
    "recovery",
    "fallback",
  ],
  "knowledge retrieval": ["retrieval", "knowledge", "rag", "context retrieval"],
  "inter-agent communication": ["communication", "agent communication", "messaging"],
  "reasoning techniques": ["reasoning", "tree of thought", "branching", "to"],
  "evaluation and monitoring": ["evaluation", "monitoring", "testing", "metrics"],
  "exploration and discovery": ["exploration", "discovery", "research"],
  "tool use": ["tool", "tools", "tool calling", "function calling"],
  planning: ["planning", "plan", "step-by-step", "sequential"],
  reflection: ["reflection", "critique", "self-reflection", "review"],
  "prompt chaining": ["prompt chaining", "chaining", "chain"],
};

/**
 * Get all possible names for a canonical term (including the term itself).
 */
function getAllVariations(term: string): string[] {
  const normalized = normalizeForMatch(term);
  const variations = [normalized];

  // Check if term has synonym mappings
  for (const [canonical, synonyms] of Object.entries(SYNONYM_MAPPINGS)) {
    if (
      normalized === normalizeForMatch(canonical) ||
      synonyms.some((s) => normalizeForMatch(s) === normalized)
    ) {
      // Add all synonyms
      for (const synonym of synonyms) {
        variations.push(normalizeForMatch(synonym));
      }
      break;
    }
  }

  return variations;
}

/** Normalize text for matching: lowercase, remove special chars, normalize spaces */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-‐–—]/g, " ") // Replace all dash types with space
    .replace(/[^\w\s]/g, "") // Remove other special chars
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/** Generate variations of a term for fuzzy matching */
function generateVariations(term: string): string[] {
  const normalized = normalizeForMatch(term);
  const variations = getAllVariations(normalized);

  // Split by space and generate word-level variations
  const words = normalized.split(" ").filter((w) => w.length > 2);

  // Add individual significant words as variations
  for (const word of words) {
    if (word.length >= 4) {
      // Only meaningful words
      variations.push(word);
    }
  }

  // Add compound variation (no spaces)
  if (words.length > 1) {
    variations.push(words.join(""));
  }

  return [...new Set(variations)]; // Deduplicate
}

/** Check if any variation of the needle is found in the haystack */
function containsFuzzy(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeForMatch(haystack);
  const variations = generateVariations(needle);

  for (const variation of variations) {
    if (normalizedHaystack.includes(variation)) {
      return true;
    }
  }

  return false;
}

/** Case-insensitive substring check (kept for backward compatibility). */
function containsIgnoreCase(haystack: string, needle: string): boolean {
  return containsFuzzy(haystack, needle);
}

/** How many items from `items` are found via fuzzy matching in `text`. */
function countMatches(
  text: string,
  items: string[]
): {
  matched: string[];
  unmatched: string[];
} {
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const item of items) {
    if (containsIgnoreCase(text, item)) {
      matched.push(item);
    } else {
      unmatched.push(item);
    }
  }
  return { matched, unmatched };
}

/** Recall = matched / total, guarded against division by zero. */
function recallScore(matched: number, total: number): number {
  if (total === 0) return 1;
  return matched / total;
}

/** Build a base MetricResult with the common fields filled in. */
function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricStatus,
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

/** Check whether the answer text exhibits abstention language. */
function answerAbstains(answer: string): boolean {
  const lower = answer.toLowerCase();
  // Phrases must be specific enough not to fire on legitimate negations in source-backed
  // technical prose (e.g. "points do not have enough neighbours").
  const phraseSignals = [
    "cannot find",
    "can't find",
    "couldn't find",
    "not found in the",
    "not found in your",
    "no information in the",
    "no information in these",
    "not covered in the",
    "not covered in these",
    "does not contain information",
    "doesn't contain information",
    "i'm unable to",
    "i am unable to",
    "i don't have access",
    "i do not have access",
    "unable to answer",
    "based on the retrieved passages, i cannot",
    "based on what's available, i cannot",
  ];
  if (phraseSignals.some((s) => lower.includes(s))) return true;
  if (/\bi ['']?(?:m|am) not able to\b/i.test(answer)) return true;
  return false;
}

/** Recall of expected items within a set of chunks (checks all chunk content). */
function chunkRecall(
  chunks: Array<{ content: string }>,
  items: string[]
): { matched: string[]; unmatched: string[]; score: number } {
  const combinedText = chunks.map((c) => c.content).join("\n");
  const { matched, unmatched } = countMatches(combinedText, items);
  return { matched, unmatched, score: recallScore(matched.length, items.length) };
}

// ─── 1. Expected Item Recall ────────────────────────────────────

/**
 * Checks how many required items appear in the answer text using
 * case-insensitive substring matching.
 *
 * Score = matched / total
 * Status: pass >= 0.9, warn >= 0.7, fail otherwise.
 */
export function expectedItemRecall(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectedItems.length === 0) {
    return baseMetric(
      "expected_item_recall",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — recall checked via expectedAnswer / LLM judge only.",
      { matched: [], unmatched: [] }
    );
  }
  const { matched, unmatched } = countMatches(artifact.answer, fixture.expectedItems);
  const score = recallScore(matched.length, fixture.expectedItems.length);

  let status: MetricStatus;
  if (score >= 0.9) status = "pass";
  else if (score >= 0.7) status = "warn";
  else status = "fail";

  const detail =
    unmatched.length === 0
      ? `All ${matched.length} expected items found in answer.`
      : `Found ${matched.length}/${fixture.expectedItems.length} expected items. Missing: ${unmatched.join(", ")}`;

  return baseMetric("expected_item_recall", fixture, artifact, status, score, detail, {
    matched,
    unmatched,
  });
}

// ─── 2. Retrieval Item Recall ───────────────────────────────────

/**
 * Checks how many required items appear in raw retrieved chunks at three
 * stages: pre-rerank, post-rerank, selected.
 *
 * Returns 3 MetricResults (one per stage).
 * Score = matched/total for each stage.
 */
export function retrievalItemRecall(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult[] {
  const stages: Array<{
    label: string;
    metric: string;
    chunks: Array<{ content: string }>;
  }> = [
    {
      label: "pre-rerank",
      metric: "retrieval_item_recall_pre_rerank",
      chunks: artifact.preRerankChunks,
    },
    {
      label: "post-rerank",
      metric: "retrieval_item_recall_post_rerank",
      chunks: artifact.postRerankChunks,
    },
    {
      label: "selected",
      metric: "retrieval_item_recall_selected",
      chunks: artifact.selectedChunks,
    },
  ];

  return stages.map(({ label, metric, chunks }) => {
    const { matched, unmatched, score } = chunkRecall(chunks, fixture.expectedItems);

    const detail =
      unmatched.length === 0
        ? `All ${matched.length} expected items found at ${label} stage (${chunks.length} chunks).`
        : `Found ${matched.length}/${fixture.expectedItems.length} at ${label} stage. Missing: ${unmatched.join(", ")}`;

    return baseMetric(metric, fixture, artifact, "info", score, detail, {
      stage: label,
      matched,
      unmatched,
      chunkCount: chunks.length,
    });
  });
}

// ─── 3. Retrieval Precision @ K ────────────────────────────────

/**
 * Relevant selected chunks / total selected chunks.
 * A chunk is "relevant" if it contains at least one expected item.
 *
 * Score = relevant / total
 * Status: pass >= 0.5, warn >= 0.3, fail otherwise.
 */
export function retrievalPrecisionAtK(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectedItems.length === 0) {
    return baseMetric(
      "retrieval_precision_at_k",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — precision@K not applicable."
    );
  }
  const total = artifact.selectedChunks.length;
  if (total === 0) {
    return baseMetric(
      "retrieval_precision_at_k",
      fixture,
      artifact,
      "fail",
      0,
      "No chunks selected; precision undefined."
    );
  }

  let relevant = 0;
  const chunkRelevance: Array<{ id: string; relevant: boolean; matchedItems: string[] }> = [];
  for (const chunk of artifact.selectedChunks) {
    const { matched } = countMatches(chunk.content, fixture.expectedItems);
    const isRelevant = matched.length > 0;
    if (isRelevant) relevant++;
    chunkRelevance.push({ id: chunk.id, relevant: isRelevant, matchedItems: matched });
  }

  const score = relevant / total;

  let status: MetricStatus;
  if (score >= 0.5) status = "pass";
  else if (score >= 0.3) status = "warn";
  else status = "fail";

  return baseMetric(
    "retrieval_precision_at_k",
    fixture,
    artifact,
    status,
    score,
    `${relevant}/${total} selected chunks are relevant (contain at least one expected item).`,
    { relevant, total, chunkRelevance }
  );
}

// ─── 4. Retrieval nDCG @ K ──────────────────────────────────────

/**
 * Simplified nDCG@K where relevance is binary (chunk contains at least one
 * expected item).
 *
 * DCG  = sum( rel_i / log2(i + 1) )   for i = 1..K (1-indexed)
 * IDCG = ideal DCG (all relevant chunks ranked first)
 * Score = DCG / IDCG. If IDCG = 0, score = 0.
 */
export function retrievalNdcgAtK(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectedItems.length === 0) {
    return baseMetric(
      "retrieval_ndcg_at_k",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — nDCG not applicable."
    );
  }
  const chunks = artifact.selectedChunks;
  const k = chunks.length;

  if (k === 0) {
    return baseMetric(
      "retrieval_ndcg_at_k",
      fixture,
      artifact,
      "fail",
      0,
      "No chunks selected; nDCG undefined."
    );
  }

  // Binary relevance for each chunk at its current rank.
  const relevance: number[] = chunks.map((chunk) => {
    const { matched } = countMatches(chunk.content, fixture.expectedItems);
    return matched.length > 0 ? 1 : 0;
  });

  // DCG = sum( rel_i / log2(i + 1) ), i is 1-indexed rank
  let dcg = 0;
  for (let i = 0; i < k; i++) {
    dcg += relevance[i] / Math.log2(i + 2); // i+2 because log2(1+1)=1 for rank 1
  }

  // IDCG: sort relevance descending, compute DCG of ideal ranking
  const sortedRel = [...relevance].sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < k; i++) {
    idcg += sortedRel[i] / Math.log2(i + 2);
  }

  const score = idcg === 0 ? 0 : dcg / idcg;

  let status: MetricStatus;
  if (score >= 0.7) status = "pass";
  else if (score >= 0.4) status = "warn";
  else status = "fail";

  const relevantCount = relevance.filter((r) => r === 1).length;

  return baseMetric(
    "retrieval_ndcg_at_k",
    fixture,
    artifact,
    status,
    score,
    `nDCG@${k} = ${score.toFixed(3)} (${relevantCount}/${k} relevant chunks).`,
    {
      k,
      dcg: Math.round(dcg * 1000) / 1000,
      idcg: Math.round(idcg * 1000) / 1000,
      relevantCount,
      relevance,
    }
  );
}

// ─── 5. Abstention Correctness ──────────────────────────────────

/**
 * Deterministic routing rule:
 * - If selected-context item recall >= 0.7 and answer abstains: "answer_generation" error, fail.
 * - If raw or post-rerank recall >= 0.7 but selected-context recall < 0.7: "context_selection" miss, fail.
 * - If all snapshots < 0.7: "retrieval_coverage" miss, warn.
 * - If answer provides items and recall >= 0.7: pass.
 */
export function abstentionCorrectness(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectedItems.length === 0) {
    return baseMetric(
      "abstention_correctness",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — abstention vs retrieval not scored deterministically.",
      { category: "none" }
    );
  }
  const selectedRecall = chunkRecall(artifact.selectedChunks, fixture.expectedItems).score;
  const preRerankRecall = chunkRecall(artifact.preRerankChunks, fixture.expectedItems).score;
  const postRerankRecall = chunkRecall(artifact.postRerankChunks, fixture.expectedItems).score;

  const abstains = answerAbstains(artifact.answer);
  const answerRecall = recallScore(
    countMatches(artifact.answer, fixture.expectedItems).matched.length,
    fixture.expectedItems.length
  );

  // Rule 1: Sufficient context was selected but answer still abstained.
  if (selectedRecall >= 0.7 && abstains) {
    return baseMetric(
      "abstention_correctness",
      fixture,
      artifact,
      "fail",
      selectedRecall,
      "Answer abstains despite sufficient context (selected recall >= 0.7). Answer generation error.",
      {
        category: "answer_generation",
        selectedRecall,
        preRerankRecall,
        postRerankRecall,
        answerRecall,
        abstains: true,
      }
    );
  }

  // Rule 2: Pre-rerank or post-rerank had items, but context selection dropped them.
  if ((preRerankRecall >= 0.7 || postRerankRecall >= 0.7) && selectedRecall < 0.7) {
    return baseMetric(
      "abstention_correctness",
      fixture,
      artifact,
      "fail",
      selectedRecall,
      "Relevant items existed pre-selection but were dropped. Context selection miss.",
      {
        category: "context_selection",
        selectedRecall,
        preRerankRecall,
        postRerankRecall,
        answerRecall,
        abstains,
      }
    );
  }

  // Rule 3: Retrieval never found the items.
  if (selectedRecall < 0.7 && preRerankRecall < 0.7 && postRerankRecall < 0.7) {
    return baseMetric(
      "abstention_correctness",
      fixture,
      artifact,
      "warn",
      Math.max(selectedRecall, preRerankRecall, postRerankRecall),
      "Retrieval could not find expected items across any stage. Retrieval coverage miss.",
      {
        category: "retrieval_coverage",
        selectedRecall,
        preRerankRecall,
        postRerankRecall,
        answerRecall,
        abstains,
      }
    );
  }

  // Rule 4: Answer provides items and recall is sufficient.
  return baseMetric(
    "abstention_correctness",
    fixture,
    artifact,
    "pass",
    selectedRecall,
    "Answer provides expected items with sufficient recall.",
    {
      category: "none",
      selectedRecall,
      preRerankRecall,
      postRerankRecall,
      answerRecall,
      abstains: false,
    }
  );
}

// ─── 6. Citation Validity ───────────────────────────────────────

/**
 * Checks that citations in the answer reference chunks that actually exist
 * in selected chunks.
 *
 * Score = valid_citations / total_citations.
 * Status: pass >= 0.8, warn >= 0.5, fail otherwise.
 * If no citations and expectedBehavior says to cite: fail with score 0.
 */
export function citationValidity(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const selectedChunkIds = new Set(artifact.selectedChunks.map((c) => c.id));
  const citations = artifact.citations;
  // Word-boundary cues only — avoid false positives (e.g. "resources" contains "source").
  const expectsCitation = /\bcitations?\b|\breferences?\b|\bsources?\b|inline\s+citation/i.test(
    fixture.expectedBehavior
  );

  // No citations found in the answer.
  if (citations.length === 0) {
    if (expectsCitation) {
      return baseMetric(
        "citation_validity",
        fixture,
        artifact,
        "fail",
        0,
        "No citations found in answer, but expectedBehavior requires citations.",
        { totalCitations: 0, validCitations: 0, expectsCitation: true }
      );
    }
    // No citations required, neutral pass.
    return baseMetric(
      "citation_validity",
      fixture,
      artifact,
      "pass",
      1,
      "No citations in answer and none expected.",
      { totalCitations: 0, validCitations: 0, expectsCitation: false }
    );
  }

  let valid = 0;
  const citationDetails: Array<{ citation: string; valid: boolean }> = [];
  for (const citation of citations) {
    // A citation is valid if it matches a chunk id in the selected set.
    const isValid = selectedChunkIds.has(citation);
    if (isValid) valid++;
    citationDetails.push({ citation, valid: isValid });
  }

  const score = valid / citations.length;

  let status: MetricStatus;
  if (score >= 0.8) status = "pass";
  else if (score >= 0.5) status = "warn";
  else status = "fail";

  return baseMetric(
    "citation_validity",
    fixture,
    artifact,
    status,
    score,
    `${valid}/${citations.length} citations reference valid selected chunks.`,
    { totalCitations: citations.length, validCitations: valid, citationDetails }
  );
}

// ─── 7. Latency / Cost Budget ──────────────────────────────────

/** Static fallback gates when no baseline file is available. */
/**
 * End-to-end chat can include HyDE, multi-subquery retrieval, rerank, and long structured answers.
 * Without a baseline, use a generous ceiling so latency reflects product behavior, not harness noise.
 *
 * Studio kinds run map-reduce over an entire notebook (and audio adds TTS on top), so their
 * inherent latency floors are well above chat. The gate per runner reflects observed steady-state
 * cost so a healthy run reads "pass", not "fail-by-design".
 */
const STATIC_TOTAL_TOKENS_GATE = 4000;
const DEFAULT_LATENCY_MS_GATE = 60000;
const PER_RUNNER_LATENCY_MS_GATE: Record<string, number> = {
  chat: 60000,
  research: 120000,
  both: 120000,
  report: 90000,
  flashcards: 90000,
  quiz: 90000,
  mindmap: 90000,
  infographic: 300000,
  spreadsheet: 90000,
  writtenQuestions: 90000,
  audioScript: 240000,
};

/**
 * Checks latency and token cost against a baseline or static gates.
 *
 * If a baseline is provided: pass if within 1.2x, warn if within 2x, fail otherwise.
 * If no baseline: pass if latency < 8000ms AND total tokens < 4000, warn if within 2x, fail otherwise.
 */
export function latencyCostBudget(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline
): MetricResult {
  const latencyMs = artifact.latencyMs;
  const totalTokens = artifact.tokenUsage?.total ?? 0;

  if (baseline) {
    const latencyRatio = latencyMs / baseline.latencyMs;
    const tokenRatio = baseline.tokenUsage.total > 0 ? totalTokens / baseline.tokenUsage.total : 0;
    const worstRatio = Math.max(latencyRatio, tokenRatio);

    let status: MetricStatus;
    if (worstRatio <= 1.2) status = "pass";
    else if (worstRatio <= 2.0) status = "warn";
    else status = "fail";

    return baseMetric(
      "latency_cost_budget",
      fixture,
      artifact,
      status,
      worstRatio,
      `Latency ${latencyMs}ms (baseline ${baseline.latencyMs}ms, ${latencyRatio.toFixed(2)}x), tokens ${totalTokens} (baseline ${baseline.tokenUsage.total}, ${tokenRatio.toFixed(2)}x).`,
      {
        latencyMs,
        totalTokens,
        latencyRatio: Math.round(latencyRatio * 100) / 100,
        tokenRatio: Math.round(tokenRatio * 100) / 100,
        baselineLatencyMs: baseline.latencyMs,
        baselineTotalTokens: baseline.tokenUsage.total,
      }
    );
  }

  // No baseline: use static gates (per-runner where defined).
  const latencyGate = PER_RUNNER_LATENCY_MS_GATE[artifact.runner] ?? DEFAULT_LATENCY_MS_GATE;
  const latencyOk = latencyMs <= latencyGate;
  const tokensOk = totalTokens <= STATIC_TOTAL_TOKENS_GATE;

  let status: MetricStatus;
  if (latencyOk && tokensOk) status = "pass";
  else if (latencyMs <= latencyGate * 2 && totalTokens <= STATIC_TOTAL_TOKENS_GATE * 2)
    status = "warn";
  else status = "fail";

  const score =
    latencyOk && tokensOk
      ? 1
      : latencyMs <= latencyGate * 2 && totalTokens <= STATIC_TOTAL_TOKENS_GATE * 2
        ? 0.5
        : 0;

  return baseMetric(
    "latency_cost_budget",
    fixture,
    artifact,
    status,
    score,
    `Latency ${latencyMs}ms (gate ${latencyGate}ms), tokens ${totalTokens} (gate ${STATIC_TOTAL_TOKENS_GATE}). No baseline.`,
    {
      latencyMs,
      totalTokens,
      latencyGate,
      tokenGate: STATIC_TOTAL_TOKENS_GATE,
      latencyOk,
      tokensOk,
      hasBaseline: false,
    }
  );
}

// Re-export types for convenience
export type { EvalBaseline };

// ─── LLM Judge Metrics (async) ─────────────────────────────────────

// LLM judge metrics require async evaluation and external LLM invocation.
// Import and use these when you need semantic correctness evaluation.

export type { JudgeResult, LlmJudgeOptions } from "./llmJudge";
export {
  llmJudgeCompleteness,
  llmJudgeCorrectness,
  llmJudgeFaithfulness,
  scoreAllLlmJudgeMetrics,
} from "./llmJudge";

// ─── Together AI Judge Integration ─────────────────────────────────

// Ready-to-use Together AI invoker for LLM judge metrics.

export type { TogetherJudgeConfig } from "./togetherLlmJudge";
export {
  batchEvaluateWithLlmJudge,
  createTogetherClient,
  createTogetherJudgeInvoker,
  DEFAULT_JUDGE_MODEL,
  FAST_JUDGE_MODEL,
  getPresetInvoker,
  JUDGE_PRESETS,
  PREMIUM_JUDGE_MODEL,
  parseJudgeArgs,
} from "./togetherLlmJudge";
