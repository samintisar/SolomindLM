"use node";

import type { ResearchStateType } from "./state";
import type { SubQuestion, SourceChannel, EvidenceEntry, ResearchPhase } from "./types";
import { buildPlanPrompt, buildWriterPrompt, PlannerOutputSchema } from "./prompts";
import { createLLM } from "../_shared/llm_factory";

// Dependencies injected from the Convex action that runs the agent.
export interface ResearchNodeDeps {
  apiKey: string;
  smartModel: string;
  // Notebook search runners (same closures as ChatAgent uses)
  runHybridSearch: (
    query: string,
    documentIds?: string[]
  ) => Promise<Array<{
    sourceId: string;
    documentId?: string;
    sourceTitle: string;
    sourceUrl?: string;
    content: string;
    chunkIndex: number;
    similarity?: number;
  }>>;
  // Stream progress callback
  onProgress: (phase: ResearchPhase, subQuestionId?: string, sourcesFound?: number) => Promise<void>;
}

// ============================================================
// PLANNER NODE — decomposes query into sub-questions
// ============================================================

export async function plannerNode(
  state: ResearchStateType,
  deps: ResearchNodeDeps
): Promise<Partial<ResearchStateType>> {
  const { query, sourcePolicy } = state;
  const enabledChannels = sourcePolicy.channels;

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.3,
    maxTokens: 2000,
  });

  const structured = llm.withStructuredOutput(PlannerOutputSchema);
  const prompt = buildPlanPrompt(query, enabledChannels);

  const parsed = await structured.invoke([{ role: "user", content: prompt }]);

  const subQuestions: SubQuestion[] = parsed.subQuestions.map((sq) => ({
    id: sq.id,
    question: sq.question,
    searchQueries: sq.searchQueries,
    sourceChannels: sq.sourceChannels.filter((ch) => enabledChannels.includes(ch as SourceChannel)) as SourceChannel[],
    status: "pending",
  }));

  return { subQuestions };
}

// ============================================================
// RETRIEVER NODE — retrieves evidence for sub-questions
// V1: notebook-only retrieval
// ============================================================

export async function retrieverNode(
  state: ResearchStateType,
  deps: ResearchNodeDeps
): Promise<Partial<ResearchStateType>> {
  const { subQuestions, iteration } = state;
  const pendingQuestions = subQuestions.filter(
    (sq) => sq.status === "pending" && sq.sourceChannels.includes("notebook")
  );

  if (pendingQuestions.length === 0) {
    return {};
  }

  await deps.onProgress("retrieving_notebook", undefined, 0);

  const newEvidence: EvidenceEntry[] = [];
  const maxResultsPerChannel = state.sourcePolicy.maxResultsPerChannel ?? 10;

  for (const sq of pendingQuestions) {
    // Search with each query for this sub-question
    const allChunks: EvidenceEntry[] = [];

    for (const searchQuery of sq.searchQueries) {
      try {
        const results = await deps.runHybridSearch(searchQuery, state.documentIds);
        for (const chunk of results.slice(0, maxResultsPerChannel)) {
          allChunks.push({
            subQuestionId: sq.id,
            sourceType: "notebook",
            sourceTitle: chunk.sourceTitle,
            sourceUrl: chunk.sourceUrl,
            content: chunk.content,
            relevanceScore: chunk.similarity,
            iteration,
            metadata: {
              documentId: chunk.documentId,
              chunkIndex: chunk.chunkIndex,
            },
          });
        }
      } catch (err) {
        console.error(`[ResearchRetriever] Search failed for "${searchQuery}":`, err);
      }
    }

    // Deduplicate by content similarity (simple exact match on first 200 chars)
    const seen = new Set<string>();
    const deduped = allChunks.filter((e) => {
      const key = e.content.slice(0, 200);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    newEvidence.push(...deduped);
    await deps.onProgress("retrieving_notebook", sq.id, deduped.length);
  }

  // Mark sub-questions as completed
  const updatedSubQuestions = subQuestions.map((sq) => {
    if (sq.status === "pending" && sq.sourceChannels.includes("notebook")) {
      return { ...sq, status: "completed" as const };
    }
    return sq;
  });

  return {
    evidence: newEvidence,
    subQuestions: updatedSubQuestions,
  };
}

// ============================================================
// WRITER NODE — synthesizes evidence into final response
// ============================================================

export async function writerNode(
  state: ResearchStateType,
  deps: ResearchNodeDeps
): Promise<Partial<ResearchStateType>> {
  await deps.onProgress("writing");

  const { query, subQuestions, evidence } = state;

  // Group evidence by sub-question
  const evidenceBySubQuestion: Record<string, typeof evidence> = {};
  for (const entry of evidence) {
    if (!evidenceBySubQuestion[entry.subQuestionId]) {
      evidenceBySubQuestion[entry.subQuestionId] = [];
    }
    evidenceBySubQuestion[entry.subQuestionId].push(entry);
  }

  const prompt = buildWriterPrompt(query, subQuestions, evidenceBySubQuestion);

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.4,
    maxTokens: 8000,
  });

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const finalResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  return {
    finalResponse,
    shouldStop: true,
    stopReason: "completed",
  };
}
