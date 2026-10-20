import type { EvalFixture, EvalRunArtifact, RetrievalConfigSnapshot } from "../types";

export interface EvalRunnerOptions {
  fixture: EvalFixture;
  config: RetrievalConfigSnapshot;
  /** If true, don't actually call agents, just validate the fixture and return a stub artifact */
  dryRun?: boolean;
  /** Chat only: stop after context selection, generating no answer (`--retrieval-only`) */
  retrievalOnly?: boolean;
}

export interface EvalRunnerResult {
  artifact: EvalRunArtifact;
  errors: string[];
}
