/**
 * Aggregator that runs all deterministic metrics and returns a flat
 * MetricResult[] for a single fixture/artifact pair.
 */
import type {
  EvalFixture,
  EvalRunArtifact,
  EvalBaseline,
  MetricResult,
} from "../types";
import {
  expectedItemRecall,
  retrievalItemRecall,
  retrievalPrecisionAtK,
  retrievalNdcgAtK,
  abstentionCorrectness,
  citationValidity,
  latencyCostBudget,
} from "./index";

/**
 * Run every deterministic metric for a single eval case.
 *
 * Returns a flat array of MetricResult entries. Metrics that produce
 * multiple results (e.g. retrievalItemRecall returns 3) are flattened.
 */
export function scoreAllMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline,
): MetricResult[] {
  const results: MetricResult[] = [];

  // Single-result metrics
  results.push(expectedItemRecall(fixture, artifact, baseline));
  results.push(retrievalPrecisionAtK(fixture, artifact, baseline));
  results.push(retrievalNdcgAtK(fixture, artifact, baseline));
  results.push(abstentionCorrectness(fixture, artifact, baseline));
  results.push(citationValidity(fixture, artifact, baseline));
  results.push(latencyCostBudget(fixture, artifact, baseline));

  // Multi-result metric: retrievalItemRecall returns 3 results (pre/post/selected)
  results.push(...retrievalItemRecall(fixture, artifact, baseline));

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
