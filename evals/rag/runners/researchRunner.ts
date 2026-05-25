import type { EvalFixture, EvalRunArtifact, ChunkSnapshot } from "../types";
import { computeConfigHash } from "../configHash";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ResearchAgentInvoker {
  invoke(args: {
    question: string;
    notebookId: Id<"notebooks">;
    documentIds?: Id<"documents">[];
    sourcePolicy?: import("../types").SourcePolicyConfig;
  }): Promise<{
    answer: string;
    subQuestions: Array<{ id: string; question: string; sourceChannels: string[] }>;
    evidence: Array<{
      subQuestionId: string;
      sourceType: string;
      sourceTitle: string;
      sourceUrl?: string;
      content: string;
      relevanceScore?: number;
      iteration: number;
    }>;
    latencyMs: number;
    tokenUsage?: { prompt: number; completion: number; total: number };
    iterations: number;
    sourcePolicy?: import("../types").SourcePolicyConfig;
  }>;
}

function validateFixture(fixture: EvalFixture): string[] {
  const errors: string[] = [];
  if (!fixture.id) errors.push("Fixture missing id");
  if (!fixture.question?.trim()) errors.push("Fixture missing question");
  if (!fixture.sourcePolicy?.channels?.length) {
    errors.push("Research fixture must specify sourcePolicy.channels");
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

export async function runResearchEval(
  options: EvalRunnerOptions,
  invoker?: ResearchAgentInvoker
): Promise<EvalRunnerResult> {
  const { fixture, config, dryRun } = options;
  const configHash = computeConfigHash(config);

  const validationErrors = validateFixture(fixture);
  if (validationErrors.length > 0) {
    return { artifact: stubArtifact(fixture, configHash), errors: validationErrors };
  }

  if (dryRun) {
    return { artifact: stubArtifact(fixture, configHash), errors: [] };
  }

  if (!invoker) {
    throw new Error(
      "No ResearchAgentInvoker provided for real run. " +
        "Use --dry-run to validate fixtures, or provide an invoker to run against real agents."
    );
  }

  const errors: string[] = [];

  try {
    const result = await invoker.invoke({
      question: fixture.question,
      notebookId: fixture.notebookId as Id<"notebooks">,
      documentIds: fixture.documentIds as Id<"documents">[] | undefined,
      sourcePolicy: fixture.sourcePolicy,
    });

    // Convert evidence to ChunkSnapshot format for metrics
    const evidenceChunks: ChunkSnapshot[] = result.evidence.map((e, i) => ({
      id: `ev_${i}`,
      sourceTitle: e.sourceTitle,
      sourceUrl: e.sourceUrl,
      content: e.content,
      similarity: e.relevanceScore,
    }));

    // Build source evidence summary
    const sourceEvidenceMap = new Map<string, { sourceCount: number; topDomains: string[] }>();
    for (const ev of result.evidence) {
      const channel = ev.sourceType;
      const existing = sourceEvidenceMap.get(channel) ?? { sourceCount: 0, topDomains: [] };
      existing.sourceCount++;
      if (ev.sourceUrl) {
        try {
          const domain = new URL(ev.sourceUrl).hostname;
          if (!existing.topDomains.includes(domain)) {
            existing.topDomains.push(domain);
          }
        } catch {
          // Invalid URL
        }
      }
      sourceEvidenceMap.set(channel, existing);
    }

    const sourceEvidence = Array.from(sourceEvidenceMap.entries()).map(([channel, data]) => ({
      channel,
      sourceCount: data.sourceCount,
      topDomains: data.topDomains.slice(0, 5),
    }));

    // Extract citations from answer text using [N] notation
    const citationPattern = /\[(\d+)\]/g;
    const citationSet = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(result.answer)) !== null) {
      const idx = parseInt(match[1], 10);
      if (idx >= 1 && idx <= evidenceChunks.length) {
        citationSet.add(evidenceChunks[idx - 1].id);
      }
    }

    const artifact: EvalRunArtifact = {
      caseId: fixture.id,
      runner: "research",
      configHash,
      answer: result.answer,
      citations: Array.from(citationSet),
      // Research uses an evidence-based pipeline (plan → gather → synthesize)
      // rather than chunk retrieval stages. Pre/post-rerank are not applicable.
      preRerankChunks: [],
      postRerankChunks: [],
      selectedChunks: evidenceChunks,
      subQueries: result.subQuestions.map((sq) => sq.question),
      latencyMs: result.latencyMs,
      tokenUsage: result.tokenUsage,
      sourcePolicy: result.sourcePolicy,
      sourceEvidence,
      timestamp: new Date().toISOString(),
    };

    return { artifact, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Research agent invocation failed: ${message}`);
    return { artifact: stubArtifact(fixture, configHash), errors };
  }
}
