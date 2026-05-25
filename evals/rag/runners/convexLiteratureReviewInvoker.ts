/**
 * LiteratureReviewInvoker backed by the real gated Convex eval action.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { LiteratureReviewInvoker } from "./literatureReviewRunner";

export interface ConvexLiteratureReviewInvokerOptions {
  evalSecret: string;
}

export function createConvexLiteratureReviewInvoker(
  convexUrl: string,
  options: ConvexLiteratureReviewInvokerOptions
): LiteratureReviewInvoker {
  const client = new ConvexHttpClient(convexUrl);

  return {
    async invoke(args) {
      return await client.action(api.eval.literatureReviewEvalAction.runLiteratureReviewEval, {
        evalSecret: options.evalSecret,
        question: args.question,
        notebookId: args.notebookId,
      });
    },
  };
}
