/**
 * Aggregator that runs all deterministic metrics and returns a flat
 * MetricResult[] for a single fixture/artifact pair.
 *
 * Runner-aware: studio runners produce no chunks/citations, so the
 * retrieval-only metrics are skipped and studio-specific scorers run instead.
 */
import type { EvalFixture, EvalRunArtifact, EvalBaseline, MetricResult } from "../types";
import {
  expectedItemRecall,
  retrievalItemRecall,
  retrievalPrecisionAtK,
  retrievalNdcgAtK,
  abstentionCorrectness,
  citationValidity,
  latencyCostBudget,
} from "./index";
import { scoreStudioMetrics } from "./studio";
import {
  sourceDiversityScore,
  sourceRecallByChannel,
  externalSourceUtilization,
} from "./sourceAware";

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

  if (isRagRunner(artifact.runner)) {
    // RAG-only metrics: depend on retrieval chunks/citations.
    results.push(retrievalPrecisionAtK(fixture, artifact, baseline));
    results.push(retrievalNdcgAtK(fixture, artifact, baseline));
    results.push(abstentionCorrectness(fixture, artifact, baseline));
    results.push(citationValidity(fixture, artifact, baseline));
    results.push(...retrievalItemRecall(fixture, artifact, baseline));

    // Source-aware metrics (only for runs with sourcePolicy configured)
    if (artifact.sourcePolicy) {
      results.push(sourceDiversityScore(fixture, artifact, baseline));
      results.push(...sourceRecallByChannel(fixture, artifact, baseline));
      results.push(externalSourceUtilization(fixture, artifact, baseline));
    }
  } else {
    // Studio runners: structural scorers keyed on studioOutput.
    const studioResults = await scoreStudioMetrics(fixture, artifact, baseline);
    results.push(...studioResults);
  }

  return results;
}

// Re-export individual metrics for direct consumption
export {
  expectedItemRecall,
  retrievalItemRecall,
  retrievalPrecisionAtK,
  retrievalNdcgAtK,
  abstentionCorrectness,
  citationValidity,
  latencyCostBudget,
};
