/**
 * Barrel exports and top-level eval dispatcher.
 *
 * Usage:
 *   import { runEval } from "./runners";
 *   const results = await runEval(fixture, { dryRun: true });
 */

export { runChatEval, type ChatAgentInvoker } from "./chatRunner";
export { runResearchEval, type ResearchAgentInvoker } from "./researchRunner";
export { runLiteratureReviewEval, type LiteratureReviewInvoker } from "./literatureReviewRunner";
export { createConvexChatInvoker } from "./convexChatInvoker";
export { createConvexLiteratureReviewInvoker } from "./convexLiteratureReviewInvoker";
export {
  createConvexStudioInvokers,
  STUDIO_INVOKER_FACTORIES,
  type StudioInvoker,
} from "./convexStudioInvoker";
export { runStudioEval } from "./studioRunner";
export { snapshotRetrievalConfig } from "./config";
export type { EvalRunnerOptions, EvalRunnerResult } from "./types";

import type { EvalFixture, StudioRunnerKind } from "../types";
import type { EvalRunnerResult } from "./types";
import { snapshotRetrievalConfig } from "./config";
import { runChatEval } from "./chatRunner";
import { runResearchEval } from "./researchRunner";
import { runLiteratureReviewEval } from "./literatureReviewRunner";
import { runStudioEval } from "./studioRunner";
import type { ChatAgentInvoker } from "./chatRunner";
import type { ResearchAgentInvoker } from "./researchRunner";
import type { LiteratureReviewInvoker } from "./literatureReviewRunner";
import type { StudioInvoker } from "./convexStudioInvoker";

export interface RunEvalOptions {
  dryRun?: boolean;
  chatInvoker?: ChatAgentInvoker;
  researchInvoker?: ResearchAgentInvoker;
  literatureReviewInvoker?: LiteratureReviewInvoker;
  studioInvokers?: Partial<Record<StudioRunnerKind, StudioInvoker>>;
}

const STUDIO_RUNNER_KINDS: ReadonlySet<StudioRunnerKind> = new Set<StudioRunnerKind>([
  "report",
  "flashcards",
  "quiz",
  "mindmap",
  "infographic",
  "spreadsheet",
  "writtenQuestions",
  "audioScript",
  "audioScriptOnly",
]);

function isStudioRunner(runner: EvalFixture["runner"]): runner is StudioRunnerKind {
  return STUDIO_RUNNER_KINDS.has(runner as StudioRunnerKind);
}

/**
 * Dispatch a single fixture to the appropriate runner(s).
 *
 * Based on `fixture.runner`, calls the corresponding runner and returns
 * all results. `"both"` expands to chat + research.
 */
export async function runEval(
  fixture: EvalFixture,
  options?: RunEvalOptions
): Promise<EvalRunnerResult[]> {
  const config = snapshotRetrievalConfig();
  const runnerOpts = {
    fixture,
    config,
    dryRun: options?.dryRun ?? false,
  };

  const results: EvalRunnerResult[] = [];
  const runner = fixture.runner;

  if (runner === "chat" || runner === "both") {
    results.push(await runChatEval(runnerOpts, options?.chatInvoker));
  }
  if (runner === "research" || runner === "both") {
    results.push(await runResearchEval(runnerOpts, options?.researchInvoker));
  }
  if (runner === "literatureReview") {
    results.push(await runLiteratureReviewEval(runnerOpts, options?.literatureReviewInvoker));
  }
  if (isStudioRunner(runner)) {
    results.push(
      await runStudioEval({ ...runnerOpts, kind: runner }, options?.studioInvokers?.[runner])
    );
  }

  return results;
}
