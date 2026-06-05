/**
 * Aggregator that runs all deterministic metrics and returns a flat
 * MetricResult[] for a single fixture/artifact pair.
 *
 * Runner-aware: studio runners produce no chunks/citations, so the
 * retrieval-only metrics are skipped and studio-specific scorers run instead.
 */
import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import {
  abstentionCorrectness,
  citationValidity,
  expectedItemRecall,
  latencyCostBudget,
  retrievalItemRecall,
  retrievalNdcgAtK,
  retrievalPrecisionAtK,
} from "./index";
import { scoreAllLlmJudgeMetrics, type LlmJudgeOptions } from "./llmJudge";
import { createTogetherJudgeInvoker } from "./togetherLlmJudge";
import {
  externalSourceUtilization,
  researchSourceBreadth,
  sourceDiversityScore,
  sourceRecallByChannel,
} from "./sourceAware";
import { scoreStudioMetrics } from "./studio";

function isChunkRetrievalRunner(runner: EvalRunArtifact["runner"]): boolean {
  // Chat uses a chunk-based retrieval pipeline with pre/post-rerank stages.
  // Research uses an evidence-based pipeline (plan → gather → synthesize)
  // where chunk-retrieval metrics don't map cleanly.
  return runner === "chat";
}

function isRagRunner(runner: EvalRunArtifact["runner"]): boolean {
  return runner === "chat" || runner === "research";
}

/**
 * Run every deterministic metric for a single eval case.
 *
 * Returns a flat array of MetricResult entries. Metrics that produce
 * multiple results (e.g. retrievalItemRecall returns 3) are flattened.
 */
export async function scoreAllMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Always-on: text-level recall and latency/cost.
  results.push(expectedItemRecall(fixture, artifact, baseline));
  results.push(latencyCostBudget(fixture, artifact, baseline));

  if (isChunkRetrievalRunner(artifact.runner)) {
    // Chunk-retrieval metrics: only meaningful for chat's staged pipeline.
    results.push(retrievalPrecisionAtK(fixture, artifact, baseline));
    results.push(retrievalNdcgAtK(fixture, artifact, baseline));
    results.push(abstentionCorrectness(fixture, artifact, baseline));
    results.push(...retrievalItemRecall(fixture, artifact, baseline));
  }

  if (isRagRunner(artifact.runner)) {
    // Citation and source metrics apply to both chat and research.
    results.push(citationValidity(fixture, artifact, baseline));

    // Source-aware metrics (only for runs with sourcePolicy configured)
    if (artifact.sourcePolicy) {
      results.push(sourceDiversityScore(fixture, artifact, baseline));
      results.push(...sourceRecallByChannel(fixture, artifact, baseline));
      results.push(externalSourceUtilization(fixture, artifact, baseline));
      if (artifact.runner === "research") {
        results.push(researchSourceBreadth(fixture, artifact, baseline));
      }
    }
  } else {
    // Studio runners: structural scorers keyed on studioOutput.
    const studioResults = await scoreStudioMetrics(fixture, artifact, baseline);
    results.push(...studioResults);
  }

  // LLM-as-a-judge metrics: semantic correctness, faithfulness, completeness.
  // Correctness only runs when fixture.expectedAnswer is set.
  // Literature review has its own dedicated LLM judge metrics (report quality, completeness, extraction quality).
  if (artifact.runner !== "literatureReview") {
    const judgeOptions: LlmJudgeOptions = process.env.TOGETHER_AI_API_KEY?.trim()
      ? { invoke: createTogetherJudgeInvoker() }
      : {};
    const judgeResults = await scoreAllLlmJudgeMetrics(fixture, artifact, judgeOptions);
    results.push(...judgeResults);
  }

  return results;
}

// Re-export individual metrics for direct consumption
export {
  abstentionCorrectness,
  citationValidity,
  expectedItemRecall,
  latencyCostBudget,
  retrievalItemRecall,
  retrievalNdcgAtK,
  retrievalPrecisionAtK,
};
