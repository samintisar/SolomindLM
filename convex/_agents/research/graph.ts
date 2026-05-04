"use node";

import { ResearchStateType } from "./state";
import { plannerNode, retrieverNode, writerNode } from "./nodes";
import type { ResearchNodeDeps } from "./nodes";
import type { SubQuestion, SourcePolicy, ResearchContext, EvidenceEntry } from "./types";

// ============================================================
// PLAN GRAPH — runs planner only, returns sub-questions
// ============================================================

export async function runPlanGraph(
  query: string,
  sourcePolicy: SourcePolicy,
  deps: ResearchNodeDeps
): Promise<SubQuestion[]> {
  const initialState: ResearchStateType = {
    query,
    sourcePolicy,
    subQuestions: [],
    evidence: [],
    gaps: [],
    iteration: 0,
    maxIterations: 2,
    conversationHistory: [],
    documentIds: undefined,
    notebookId: "",
    userId: "",
    shouldStop: false,
    stopReason: "",
    finalResponse: "",
  };

  const state = await plannerNode(initialState, deps);
  return state.subQuestions ?? [];
}

// ============================================================
// EXECUTE GRAPH — retrieves evidence and writes response
// V2: iterative loop with gap analysis
// ============================================================

interface ExecuteResult {
  finalResponse: string;
  evidence: EvidenceEntry[];
}

export async function runExecuteGraph(
  query: string,
  subQuestions: SubQuestion[],
  sourcePolicy: SourcePolicy,
  context: ResearchContext,
  deps: ResearchNodeDeps
): Promise<ExecuteResult> {
  let state: ResearchStateType = {
    query,
    subQuestions,
    sourcePolicy,
    evidence: [],
    gaps: [],
    iteration: 0,
    maxIterations: 2,
    conversationHistory: context.conversationHistory,
    documentIds: context.documentIds,
    notebookId: context.notebookId,
    userId: context.userId,
    shouldStop: false,
    stopReason: "",
    finalResponse: "",
  };

  const graphStartTime = Date.now();
  const MAX_GRAPH_DURATION_MS = 240_000; // 4 minutes — stay under Convex's ~5 min action limit

  // Iterative retrieve loop
  while (state.iteration < state.maxIterations) {
    // Reset sub-question statuses for re-retrieval on subsequent iterations
    if (state.iteration > 0) {
      state = {
        ...state,
        subQuestions: state.subQuestions.map((sq) =>
          sq.status === "completed" ? { ...sq, status: "pending" as const } : sq
        ),
      };
    }

    // Retrieve evidence
    const retrievalResult = await retrieverNode(state, deps);
    const newEvidence = retrievalResult.evidence ?? [];
    const updatedSubQuestions = retrievalResult.subQuestions ?? state.subQuestions;
    state = {
      ...state,
      subQuestions: updatedSubQuestions,
      evidence: [...state.evidence, ...newEvidence],
      iteration: state.iteration + 1,
    };

    // Time-based circuit breaker — bail early if approaching action limit
    const elapsedMs = Date.now() - graphStartTime;
    if (elapsedMs > MAX_GRAPH_DURATION_MS) {
      console.log(`[ResearchGraph] Time budget exhausted (${elapsedMs}ms > ${MAX_GRAPH_DURATION_MS}ms), stopping iteration`);
      break;
    }

    // Gap analysis: check if any sub-questions have insufficient evidence
    const evidenceBySubQuestion: Record<string, EvidenceEntry[]> = {};
    for (const e of state.evidence) {
      if (!evidenceBySubQuestion[e.subQuestionId]) evidenceBySubQuestion[e.subQuestionId] = [];
      evidenceBySubQuestion[e.subQuestionId]!.push(e);
    }

    const gaps = subQuestions
      .map((sq) => ({
        subQuestionId: sq.id,
        evidenceCount: evidenceBySubQuestion[sq.id]?.length ?? 0,
      }))
      .filter((g) => g.evidenceCount < 2); // Threshold: at least 2 evidence pieces per SQ

    // Stop if we have enough evidence or reached max iterations
    if (gaps.length === 0 || state.iteration >= state.maxIterations) {
      break;
    }

    // Log gap analysis for debugging
    console.log(`[ResearchGraph] Iteration ${state.iteration}: ${gaps.length} sub-questions need more evidence`);
  }

  // Write final response
  const writerResult = await writerNode(state, deps);
  state = { ...state, ...writerResult };

  // Order evidence the same way as buildWriterPrompt (sub-question order, then per-SQ order)
  const bySub: Record<string, EvidenceEntry[]> = {};
  for (const e of state.evidence) {
    if (!bySub[e.subQuestionId]) bySub[e.subQuestionId] = [];
    bySub[e.subQuestionId]!.push(e);
  }
  const orderedEvidence = subQuestions.flatMap((sq) => bySub[sq.id] ?? []);

  return {
    finalResponse: state.finalResponse,
    evidence: orderedEvidence,
  };
}
