/**
 * ResearchAgentInvoker that calls the real ResearchAgent via a Convex action.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { ResearchAgentInvoker } from "./researchRunner";

export interface ConvexResearchInvokerOptions {
  evalSecret: string;
}

export function createConvexResearchInvoker(
  convexUrl: string,
  options: ConvexResearchInvokerOptions
): ResearchAgentInvoker {
  const client = new ConvexHttpClient(convexUrl);

  return {
    async invoke(args) {
      const result = await client.action(api.eval.researchEvalAction.runResearchEval, {
        evalSecret: options.evalSecret,
        question: args.question,
        notebookId: args.notebookId,
        documentIds: args.documentIds,
        sourcePolicy: args.sourcePolicy,
      });

      return {
        answer: result.answer,
        subQuestions: result.subQuestions,
        evidence: result.evidence,
        latencyMs: result.latencyMs,
        iterations: result.iterations,
        sourcePolicy: result.sourcePolicy,
      };
    },
  };
}
