/**
 * The invokers a real (non-dry) run calls, all against one Convex deployment. Shared by the eval
 * CLI and the sweep runner so both drive the same agents.
 */

import {
  createConvexChatInvoker,
  createConvexLiteratureReviewInvoker,
  createConvexResearchInvoker,
  createConvexStudioInvokers,
} from "./runners";
import type { ChatAgentInvoker } from "./runners/chatRunner";
import type { StudioInvoker } from "./runners/convexStudioInvoker";
import type { LiteratureReviewInvoker } from "./runners/literatureReviewRunner";
import type { ResearchAgentInvoker } from "./runners/researchRunner";
import type { StudioRunnerKind } from "./types";
import { createConvexSeedApi } from "./usecases/convexSeedApi";
import type { PackSeedApi } from "./usecases/seedClient";

export interface LiveInvokers {
  chatInvoker: ChatAgentInvoker;
  researchInvoker: ResearchAgentInvoker;
  literatureReviewInvoker: LiteratureReviewInvoker;
  studioInvokers: Partial<Record<StudioRunnerKind, StudioInvoker>>;
  seedApi: PackSeedApi;
}

/** Invokers for every runner kind, pointed at `convexUrl`, authenticated with `evalSecret`. */
export function createLiveInvokers(convexUrl: string, evalSecret: string): LiveInvokers {
  return {
    chatInvoker: createConvexChatInvoker(convexUrl, { evalSecret }),
    researchInvoker: createConvexResearchInvoker(convexUrl, { evalSecret }),
    literatureReviewInvoker: createConvexLiteratureReviewInvoker(convexUrl, { evalSecret }),
    studioInvokers: createConvexStudioInvokers(convexUrl, { evalSecret }),
    seedApi: createConvexSeedApi(convexUrl, evalSecret),
  };
}
