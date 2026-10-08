/**
 * Barrel exports and top-level eval dispatcher.
 *
 * Usage:
 *   import { runEval } from "./runners";
 *   const results = await runEval(fixture, { dryRun: true });
 */

export { createConvexChatInvoker } from "./convexChatInvoker";
export { createConvexLiteratureReviewInvoker } from "./convexLiteratureReviewInvoker";
export { createConvexResearchInvoker } from "./convexResearchInvoker";
export { createConvexStudioInvokers } from "./convexStudioInvoker";

import { type EvalFixture, isStudioRunner, type StudioRunnerKind } from "../types";
import type { ChatAgentInvoker } from "./chatRunner";
import { runChatEval } from "./chatRunner";
import { snapshotRetrievalConfig } from "./config";
import type { StudioInvoker } from "./convexStudioInvoker";
import type { LiteratureReviewInvoker } from "./literatureReviewRunner";
import { runLiteratureReviewEval } from "./literatureReviewRunner";
import type { ResearchAgentInvoker } from "./researchRunner";
import { runResearchEval } from "./researchRunner";
import { runStudioEval } from "./studioRunner";
import type { EvalRunnerResult } from "./types";

export interface RunEvalOptions {
  dryRun?: boolean;
  chatInvoker?: ChatAgentInvoker;
  researchInvoker?: ResearchAgentInvoker;
  literatureReviewInvoker?: LiteratureReviewInvoker;
  studioInvokers?: Partial<Record<StudioRunnerKind, StudioInvoker>>;
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
