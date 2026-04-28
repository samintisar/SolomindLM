import type { EvalFixture } from "../types";
import { agenticPatterns20 } from "./agentic-patterns-20";
import { mlFactoidFixtures } from "./ml/factoid";
import { mlListEnumerationFixtures } from "./ml/listEnumeration";
import { mlComparisonFixtures } from "./ml/comparison";
import { mlCausalityFixtures } from "./ml/causality";
import { mlTemporalFixtures } from "./ml/temporal";
import { mlAmbiguousFixtures } from "./ml/ambiguous";
import { mlMultiDocFixtures } from "./ml/multiDoc";
import { mlTechnicalFixtures } from "./ml/technical";
import { mlSummarizationFixtures } from "./ml/summarization";
import { mlExplanationFixtures } from "./ml/explanation";

// Export scenario category types and helpers
export { SCENARIO_CATEGORIES, inferCategory } from "./scenarioCategories";
export type { ScenarioCategory } from "./scenarioCategories";

// Export fixture creation helpers
export { createFixture, createFixtureBatch, exampleMlFixture } from "./fixtureTemplate";

// Export NotebookLM converter
export {
  parseNotebookLMOutput,
  notebookLMToFixtures,
  convertNotebookLM,
} from "./notebookLM_converter";

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
};

/** Get a fixture by id, throws if not found */
export function getFixture(id: string): EvalFixture {
  const fixture = FIXTURES[id];
  if (!fixture) {
    throw new Error(
      `Unknown fixture: "${id}". Available: ${Object.keys(FIXTURES).join(", ")}`
    );
  }
  return fixture;
}

/** List all registered fixture ids */
export function listFixtureIds(): string[] {
  return Object.keys(FIXTURES);
}
