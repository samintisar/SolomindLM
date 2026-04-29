/**
 * Barrel exports and top-level eval dispatcher.
 *
 * Usage:
 *   import { runEval } from "./runners";
 *   const results = await runEval(fixture, { dryRun: true });
 */

export { runChatEval, type ChatAgentInvoker } from "./chatRunner";
export { runResearchEval, type ResearchAgentInvoker } from "./researchRunner";
export { createConvexChatInvoker } from "./convexChatInvoker";
export { snapshotRetrievalConfig } from "./config";
export type { EvalRunnerOptions, EvalRunnerResult } from "./types";

import type { EvalFixture } from "../types";
import type { EvalRunnerResult } from "./types";
import { snapshotRetrievalConfig } from "./config";
import { runChatEval } from "./chatRunner";
import { runResearchEval } from "./researchRunner";
import type { ChatAgentInvoker } from "./chatRunner";
import type { ResearchAgentInvoker } from "./researchRunner";

export interface RunEvalOptions {
  dryRun?: boolean;
  chatInvoker?: ChatAgentInvoker;
  researchInvoker?: ResearchAgentInvoker;
}

/**
 * Dispatch a single fixture to the appropriate runner(s).
 *
 * Based on `fixture.runner` ("chat", "research", or "both"),
 * calls the corresponding runner and returns all results.
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
  const runnerKind = fixture.runner;

  if (runnerKind === "chat" || runnerKind === "both") {
    results.push(await runChatEval(runnerOpts, options?.chatInvoker));
  }

  if (runnerKind === "research" || runnerKind === "both") {
    results.push(await runResearchEval(runnerOpts, options?.researchInvoker));
  }

  return results;
}
