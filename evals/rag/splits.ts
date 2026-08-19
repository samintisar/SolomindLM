/**
 * Fixture split assignment for smoke / train / holdout eval loops.
 */
import { getFixture, listFixtureIds } from "./fixtures";
import type { EvalFixture, EvalSplit } from "./types";

/** Fixtures explicitly held out (~20% of ML + research + LR). */
const HOLDOUT_IDS = new Set<string>([
  "ml-factoid-distributional-hypothesis",
  "ml-list-ml-problem-types",
  "ml-comparison-supervised-unsupervised",
  "ml-causality-complexity-overfitting",
  "ml-temporal-sklearn-workflow",
  "ml-ambiguous-error-meanings",
  "ml-multidoc-class-imbalance-methods",
  "ml-technical-distance-formulas",
  "ml-summarization-fundamental-tradeoff",
  "ml-explanation-dbscan-mechanism",
  "research-009-ml-learning-path",
  "literature-review-005-mental-health-digital",
  "studio-ml-mindmap-holdout",
]);

/** Smoke suite: fast gate — one chat, research, LR case + agentic studio. */
const SMOKE_IDS = new Set<string>([
  "agentic-patterns-20",
  "research-001-inflation-factors",
  "literature-review-001-rag-evaluation",
  "studio-report-agentic-patterns-20",
  "studio-flashcards-agentic-patterns-20",
  "studio-quiz-agentic-patterns-20",
  "studio-mindmap-agentic-patterns-20",
  "studio-infographic-agentic-patterns-20",
  "studio-spreadsheet-agentic-patterns-20",
  "studio-written-questions-agentic-patterns-20",
  "studio-audio-script-only-short",
]);

/**
 * Resolve the eval split for a fixture.
 * Explicit `fixture.split` wins, then the smoke/holdout registries.
 */
export function getFixtureSplit(fixture: EvalFixture): EvalSplit {
  if (fixture.split) {
    return fixture.split;
  }
  if (SMOKE_IDS.has(fixture.id)) {
    return "smoke";
  }
  if (HOLDOUT_IDS.has(fixture.id)) {
    return "holdout";
  }
  return "train";
}

/** List fixture ids for a split. */
export function listFixtureIdsForSplit(split: EvalSplit): string[] {
  return listFixtureIds().filter((id) => getFixtureSplit(getFixture(id)) === split);
}

/** Filter fixture ids to those matching the requested split. */
export function filterFixtureIdsBySplit(ids: string[], split: EvalSplit): string[] {
  return ids.filter((id) => getFixtureSplit(getFixture(id)) === split);
}
