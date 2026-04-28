import type { EvalFixture, EvalRunArtifact, ChunkSnapshot } from "../types";
import { computeConfigHash } from "../configHash";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";
import type { ReferenceChunk } from "../../../convex/storage/ChatHistoryService";
import type { ChatAgentContext } from "../../../convex/_agents/chat/types";

// ─── Invoker interface ────────────────────────────────────────
// The eval runner cannot call Convex agents directly from a
// standalone script.  Instead, the host (e.g. an integration test
// or CLI harness) provides an invoker that wraps the real agent
// call and returns a structured result.

export interface ChatAgentInvoker {
  invoke(context: ChatAgentContext): Promise<{
    answer: string;
    citations: string[];
    subQueries: string[];
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
  if (!Array.isArray(fixture.expectedItems)) {
    errors.push("expectedItems must be an array");
  } else if (
    fixture.expectedItems.length === 0 &&
    !fixture.expectedAnswer?.trim()
  ) {
    errors.push(
      "Fixture must have at least one expectedItem or a non-empty expectedAnswer",
    );
  }

  return errors;
}

function stubArtifact(fixture: EvalFixture, configHash: string): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "chat",
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

export async function runChatEval(
  options: EvalRunnerOptions,
  invoker?: ChatAgentInvoker
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
      "No ChatAgentInvoker provided for real run. " +
      "Use --dry-run to validate fixtures, or provide an invoker to run against real agents."
    );
  }

  // userId is a sentinel placeholder. The Convex invoker
  // (`evals/rag/runners/convexChatInvoker.ts`) does NOT forward it, and the
  // Convex eval action derives identity from the notebook owner server-side.
  // Field exists only to satisfy the shared `ChatAgentContext` shape; if a
  // future invoker starts using it, that invoker must derive a real userId
  // rather than relying on this string.
  const agentContext: ChatAgentContext = {
    userId: "__eval_unused__",
    noteId: fixture.notebookId ?? "",
    conversationHistory: [{ role: "user", content: fixture.question }],
    documentIds: fixture.documentIds,
  };

  const errors: string[] = [];

  try {
    const result = await invoker.invoke(agentContext);

    const artifact: EvalRunArtifact = {
      caseId: fixture.id,
      runner: "chat",
      configHash,
      answer: result.answer,
      citations: result.citations,
      preRerankChunks: result.preRerankChunks.map(toChunkSnapshot),
      postRerankChunks: result.postRerankChunks.map(toChunkSnapshot),
      selectedChunks: result.selectedChunks.map(toChunkSnapshot),
      subQueries: result.subQueries,
      latencyMs: result.latencyMs,
      tokenUsage: result.tokenUsage,
      timestamp: new Date().toISOString(),
    };

    return { artifact, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Chat agent invocation failed: ${message}`);
    return {
      artifact: stubArtifact(fixture, configHash),
      errors,
    };
  }
}
