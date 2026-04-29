import type { EvalFixture, EvalRunArtifact, ChunkSnapshot } from "../types";
import { computeConfigHash } from "../configHash";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";
import type { ReferenceChunk } from "../../../convex/storage/ChatHistoryService";
import type { ResearchContext } from "../../../convex/_agents/research/types";

// ─── Invoker interface ────────────────────────────────────────
// Mirrors the chatRunner pattern: the host provides an invoker
// that wraps the real research agent and returns structured output.

export interface ResearchAgentInvoker {
  invoke(context: ResearchContext): Promise<{
    answer: string;
    citations: string[];
    subQueries: string[];
    plan: { query: string; subQuestions: Array<{ id: string; question: string }> };
    evidence: Array<{
      subQuestionId: string;
      sourceTitle: string;
      relevanceScore: number;
      content: string;
    }>;
    preRerankChunks: ReferenceChunk[];
    postRerankChunks: ReferenceChunk[];
    selectedChunks: ReferenceChunk[];
    latencyMs: number;
    tokenUsage?: { prompt: number; completion: number; total: number };
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────

function toChunkSnapshot(chunk: ReferenceChunk): ChunkSnapshot {
  return {
    id: chunk.id,
    sourceTitle: chunk.sourceTitle,
    sourceUrl: chunk.sourceUrl,
    content: chunk.content,
    similarity: chunk.similarity,
    rrfScore: chunk.rrfScore,
    vectorRank: chunk.vectorRank,
    keywordRank: chunk.keywordRank,
  };
}

function validateFixture(fixture: EvalFixture): string[] {
  const errors: string[] = [];

  if (!fixture.id) {
    errors.push("Fixture missing id");
  }
  if (!fixture.question?.trim()) {
    errors.push("Fixture missing question");
  }
  if (!Array.isArray(fixture.expectedItems) || fixture.expectedItems.length === 0) {
    errors.push("Fixture must have at least one expectedItem");
  }

  return errors;
}

function stubArtifact(fixture: EvalFixture, configHash: string): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "research",
    configHash,
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 0,
    timestamp: new Date().toISOString(),
  };
}

// ─── Runner ───────────────────────────────────────────────────

export async function runResearchEval(
  options: EvalRunnerOptions,
  invoker?: ResearchAgentInvoker
): Promise<EvalRunnerResult> {
  const { fixture, config, dryRun } = options;
  const configHash = computeConfigHash(config);

  // Validate fixture structure
  const validationErrors = validateFixture(fixture);
  if (validationErrors.length > 0) {
    return {
      artifact: stubArtifact(fixture, configHash),
      errors: validationErrors,
    };
  }

  // Dry-run: return stub artifact without calling any agent
  if (dryRun) {
    return {
      artifact: stubArtifact(fixture, configHash),
      errors: [],
    };
  }

  // Real run: invoker is required — fail fast rather than producing stub metrics
  if (!invoker) {
    throw new Error(
      "No ResearchAgentInvoker provided for real run. " +
      "Use --dry-run to validate fixtures, or provide an invoker to run against real agents."
    );
  }

  const researchContext: ResearchContext = {
    userId: "eval-runner",
    notebookId: fixture.notebookId ?? "",
    conversationHistory: [],
    documentIds: fixture.documentIds,
  };

  const errors: string[] = [];

  try {
    const result = await invoker.invoke(researchContext);

    const artifact: EvalRunArtifact = {
      caseId: fixture.id,
      runner: "research",
      configHash,
      answer: result.answer,
      citations: result.citations,
      preRerankChunks: result.preRerankChunks.map(toChunkSnapshot),
      postRerankChunks: result.postRerankChunks.map(toChunkSnapshot),
      selectedChunks: result.selectedChunks.map(toChunkSnapshot),
      subQueries: result.subQueries,
      researchPlan: result.plan,
      evidence: result.evidence,
      latencyMs: result.latencyMs,
      tokenUsage: result.tokenUsage,
      timestamp: new Date().toISOString(),
    };

    return { artifact, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Research agent invocation failed: ${message}`);
    return {
      artifact: stubArtifact(fixture, configHash),
      errors,
    };
  }
}
