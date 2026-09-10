import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FeedbackContextCapture, FeedbackType } from "../feedbackTypes";

export interface SubmitFeedbackInput extends FeedbackContextCapture {
  type: FeedbackType;
  body: string;
  detail?: string;
  screenshotId?: Id<"_storage">;
}

/** Submit a feedback row. Returns `{ id }`. */
export function useSubmitFeedback() {
  const submit = useMutation(api.feedback.index.submit);
  return (input: SubmitFeedbackInput) =>
    submit({
      type: input.type,
      body: input.body,
      detail: input.detail,
      screenshotId: input.screenshotId,
      route: input.route,
      surface: input.surface,
      appVersion: input.appVersion,
      lastRequestId: input.lastRequestId,
    });
}

/** Upload a screenshot to Convex storage; returns its storage id. */
export function useUploadFeedbackScreenshot() {
  const generateUploadUrl = useMutation(api.feedback.index.generateUploadUrl);
  return async (file: File): Promise<Id<"_storage">> => {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Screenshot upload failed");
    const { storageId } = (await res.json()) as { storageId: string };
    return storageId as Id<"_storage">;
  };
}

/** `undefined` while loading, then the boolean. */
export function useIsFeedbackAdmin(): boolean | undefined {
  return useQuery(api.feedback.index.isAdmin, {});
}

export function useAllFeedback(status?: string) {
  return useQuery(api.feedback.index.listAll, status ? { status } : {});
}

export function useCreateGithubIssue() {
  const run = useAction(api.feedback.github.createGithubIssue);
  return (feedbackId: string) => run({ feedbackId: feedbackId as Id<"feedback"> });
}
