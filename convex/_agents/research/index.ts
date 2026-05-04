"use node";

import { runPlanGraph, runExecuteGraph } from "./graph";
import type { ResearchNodeDeps } from "./nodes";
import type { SubQuestion, SourcePolicy, ResearchContext, ResearchStreamChunk } from "./types";

export type { SubQuestion, SourcePolicy, ResearchContext, ResearchStreamChunk };

// Public interface for the deep research agent.
// Phase 1: generate a research plan (sub-questions + search strategy)
// Phase 2: execute the plan (retrieve evidence + write response)

export class ResearchAgent {
  private deps: ResearchNodeDeps;

  constructor(deps: ResearchNodeDeps) {
    this.deps = deps;
  }

  // Phase 1: Generate plan
  async generatePlan(
    query: string,
    sourcePolicy: SourcePolicy
  ): Promise<SubQuestion[]> {
    return runPlanGraph(query, sourcePolicy, this.deps);
  }

  // Phase 2: Execute plan
  // Phase 2: Execute plan
  async *executeResearch(
    query: string,
    subQuestions: SubQuestion[],
    sourcePolicy: SourcePolicy,
    context: ResearchContext
  ): AsyncGenerator<ResearchStreamChunk> {
    const result = await runExecuteGraph(query, subQuestions, sourcePolicy, context, this.deps);

    // Persisted by Convex action before token streaming
    if (result.evidence.length > 0) {
      yield { type: "evidence", data: result.evidence };
    }

    // Stream the final response token-by-token
    if (result.finalResponse) {
      // Split into chunks for smooth streaming
      const chunkSize = 20;
      for (let i = 0; i < result.finalResponse.length; i += chunkSize) {
        yield {
          type: "token",
          data: result.finalResponse.slice(i, i + chunkSize),
        };
      }

      // Yield references in the same shape as ChatAgent/ReferenceChunk
      const references = result.evidence.map((e, idx) => ({
        id: idx + 1,
        sourceId: e.subQuestionId ? `${e.subQuestionId}-${idx}` : String(idx + 1),
        documentId: (e.metadata as any)?.documentId,
        sourceTitle: e.sourceTitle,
        sourceUrl: e.sourceUrl,
        sourceType: e.sourceType,
        content: e.content.slice(0, 300),
        chunkIndex: idx,
        similarity: e.relevanceScore ?? 0.5,
      }));

      yield { type: "references", data: references };
    }

    yield { type: "done" };
  }
}
