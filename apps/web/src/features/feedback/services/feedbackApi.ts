import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type { FeedbackContextCapture, FeedbackType } from "../feedbackTypes";

export interface SubmitFeedbackInput extends FeedbackContextCapture {
  type: FeedbackType;
  body: string;
  detail?: string;
}

/** Submit a feedback row. Returns `{ id }`. */
export function useSubmitFeedback() {
  const submit = useMutation(api.feedback.index.submit);
  return useCallback(
    (input: SubmitFeedbackInput) =>
      submit({
        type: input.type,
        body: input.body,
        detail: input.detail,
        route: input.route,
        surface: input.surface,
        appVersion: input.appVersion,
        lastRequestId: input.lastRequestId,
      }),
    [submit]
  );
}

/**
 * `undefined` while loading, then the boolean. Pass `enabled=false` to skip the
 * query entirely (e.g. when the menu holding it isn't shown to signed-in users).
 */
export function useIsFeedbackAdmin(enabled = true): boolean | undefined {
  return useQuery(api.feedback.index.isAdmin, enabled ? {} : "skip");
}

export function useAllFeedback(enabled = true) {
  return useQuery(api.feedback.index.listAll, enabled ? {} : "skip");
}

export function useCreateGithubIssue() {
  const run = useAction(api.feedback.github.createGithubIssue);
  return useCallback(
    (feedbackId: string) => run({ feedbackId: feedbackId as Id<"feedback"> }),
    [run]
  );
}
