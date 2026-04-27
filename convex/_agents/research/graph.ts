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
// V1: single pass, no iteration loop
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

  // Linear: retrieve → write
  const retrievalResult = await retrieverNode(state, deps);
  const newEvidence = retrievalResult.evidence ?? [];
  const updatedSubQuestions = retrievalResult.subQuestions ?? state.subQuestions;
  state = {
    ...state,
    subQuestions: updatedSubQuestions,
    evidence: [...state.evidence, ...newEvidence],
  };

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
