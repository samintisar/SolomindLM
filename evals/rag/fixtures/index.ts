import type { EvalFixture } from "../types";
import { agenticPatterns20 } from "./agentic-patterns-20";
import { literatureReviewFixtures } from "./literatureReview";
import { mlAmbiguousFixtures } from "./ml/ambiguous";
import { mlCausalityFixtures } from "./ml/causality";
import { mlComparisonFixtures } from "./ml/comparison";
import { mlExplanationFixtures } from "./ml/explanation";
import { mlFactoidFixtures } from "./ml/factoid";
import { mlListEnumerationFixtures } from "./ml/listEnumeration";
import { mlMultiDocFixtures } from "./ml/multiDoc";
import { mlSummarizationFixtures } from "./ml/summarization";
import { mlTechnicalFixtures } from "./ml/technical";
import { mlTemporalFixtures } from "./ml/temporal";
import { researchFixtures } from "./research";
import { allSourceFixtures } from "./sourceTests";
import { STUDIO_FIXTURES } from "./studio";

// Export fixture creation helpers
export { createFixture, createFixtureBatch, exampleMlFixture } from "./fixtureTemplate";
// Export NotebookLM converter
export {
  convertNotebookLM,
  notebookLMToFixtures,
  parseNotebookLMOutput,
} from "./notebookLM_converter";
export type { ScenarioCategory } from "./scenarioCategories";
// Export scenario category types and helpers
export { inferCategory, SCENARIO_CATEGORIES } from "./scenarioCategories";

export {
  DEFAULT_SOURCE_MATRIX,
  withAcademicWebMatrix,
  withNewsMatrix,
  withSourceMatrix,
} from "./sourceFilterVariants";

/** Registry of all golden eval fixtures */
export const FIXTURES: Record<string, EvalFixture> = {
  [agenticPatterns20.id]: agenticPatterns20,
  // ML fixtures
  ...Object.fromEntries(mlFactoidFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlListEnumerationFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlComparisonFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlCausalityFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlTemporalFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlAmbiguousFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlMultiDocFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlTechnicalFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlSummarizationFixtures.map((f) => [f.id, f])),
  ...Object.fromEntries(mlExplanationFixtures.map((f) => [f.id, f])),
  // Studio fixtures
  ...Object.fromEntries(STUDIO_FIXTURES.map((f) => [f.id, f])),
  // Source test fixtures
  ...Object.fromEntries(allSourceFixtures.map((f) => [f.id, f])),
  // Research fixtures
  ...Object.fromEntries(researchFixtures.map((f) => [f.id, f])),
  // Literature review fixtures
  ...Object.fromEntries(literatureReviewFixtures.map((f) => [f.id, f])),
};

/** Get a fixture by id, throws if not found */
export function getFixture(id: string): EvalFixture {
  const fixture = FIXTURES[id];
  if (!fixture) {
    throw new Error(`Unknown fixture: "${id}". Available: ${Object.keys(FIXTURES).join(", ")}`);
  }
  return fixture;
}

/** List all registered fixture ids */
export function listFixtureIds(): string[] {
  return Object.keys(FIXTURES);
}
