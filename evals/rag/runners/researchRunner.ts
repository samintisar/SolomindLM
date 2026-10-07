import type { Id } from "../../../convex/_generated/dataModel";
import { parseEvalSourceChannel } from "../sourceChannels";
import type { ChunkSnapshot, EvalFixture, EvalSourceChannel } from "../types";
import { runWithHarness } from "./harness";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";

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
    tokenUsageSource?: "provider" | "estimated";
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

export async function runResearchEval(
  options: EvalRunnerOptions,
  invoker?: ResearchAgentInvoker
): Promise<EvalRunnerResult> {
  const { fixture } = options;
  return runWithHarness(options, invoker, {
    runner: "research",
    validate: validateFixture,
    missingInvokerMessage:
      "No ResearchAgentInvoker provided for real run. " +
      "Use --dry-run to validate fixtures, or provide an invoker to run against real agents.",
    failurePrefix: "Research agent invocation failed",
    async invoke(research, configHash) {
      const result = await research.invoke({
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
      const sourceEvidenceMap = new Map<
        EvalSourceChannel,
        { sourceCount: number; topDomains: string[] }
      >();
      for (const ev of result.evidence) {
        const channel = parseEvalSourceChannel(ev.sourceType);
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

      return {
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
        researchPlan: {
          query: fixture.question,
          subQuestions: result.subQuestions.map((sq) => ({ id: sq.id, question: sq.question })),
        },
        evidence: result.evidence.map((row) => ({
          subQuestionId: row.subQuestionId,
          sourceTitle: row.sourceTitle,
          relevanceScore: row.relevanceScore,
          content: row.content,
        })),
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
        tokenUsageSource: result.tokenUsageSource ?? "estimated",
        sourcePolicy: result.sourcePolicy,
        sourceEvidence,
        timestamp: new Date().toISOString(),
      };
    },
  });
}
