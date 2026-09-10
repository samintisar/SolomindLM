import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { ExternalServiceError } from "../_lib/errors";
import { assertFeedbackAdmin } from "../_lib/feedbackAdmin";
import {
  type FeedbackType,
  feedbackIssueBody,
  feedbackIssueLabels,
  feedbackIssueTitle,
} from "../_model/feedback";
import { getAuthUserId } from "../auth";

interface SyncPayload {
  type: FeedbackType;
  body: string;
  detail?: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  lastRequestId?: string;
  userId: string;
}

/** Admin-gated read of a feedback row for GitHub sync. Throws if already synced. */
export const getForSync = internalQuery({
  args: { feedbackId: v.id("feedback"), callerUserId: v.id("users") },
  handler: async (ctx, args): Promise<SyncPayload> => {
    await assertFeedbackAdmin(ctx, args.callerUserId);
    const row = await ctx.db.get(args.feedbackId);
    if (!row) throw new Error("Feedback not found");
    if (row.githubIssueNumber != null) {
      throw new Error("This feedback already has a GitHub issue");
    }
    return {
      type: row.type,
      body: row.body,
      detail: row.detail,
      route: row.route,
      planTier: row.planTier,
      surface: row.surface,
      appVersion: row.appVersion,
      lastRequestId: row.lastRequestId,
      userId: row.userId as string,
    };
  },
});

export const attachGithubIssue = internalMutation({
  args: { feedbackId: v.id("feedback"), number: v.number(), url: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedbackId, {
      githubIssueNumber: args.number,
      githubIssueUrl: args.url,
      updatedAt: Date.now(),
    });
  },
});

export const createGithubIssue = action({
  args: { feedbackId: v.id("feedback") },
  returns: v.object({ number: v.number(), url: v.string() }),
  handler: async (ctx, args): Promise<{ number: number; url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const payload = await ctx.runQuery(internal.feedback.github.getForSync, {
      feedbackId: args.feedbackId,
      callerUserId: userId as Id<"users">,
    });

    // Read the token/repo directly from `process.env` (not the `env.ts`
    // module-eval snapshot) so tests and runtime config changes take effect.
    const token = process.env.FEEDBACK_GITHUB_TOKEN || "";
    if (!token) {
      throw new ExternalServiceError("GitHub", "FEEDBACK_GITHUB_TOKEN is not set");
    }
    const repo = process.env.FEEDBACK_GITHUB_REPO || "samintisar/SolomindLM";

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "SolomindLM-feedback",
      },
      body: JSON.stringify({
        title: feedbackIssueTitle(payload.body),
        body: feedbackIssueBody(payload),
        labels: feedbackIssueLabels(payload.type),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ExternalServiceError("GitHub", `Issue create failed: ${res.status}`, {
        statusCode: res.status,
        detail: text.slice(0, 300),
      });
    }

    const json = (await res.json()) as { number?: number; html_url?: string };
    if (typeof json.number !== "number" || typeof json.html_url !== "string") {
      throw new ExternalServiceError("GitHub", "Unexpected issue-create response shape");
    }

    await ctx.runMutation(internal.feedback.github.attachGithubIssue, {
      feedbackId: args.feedbackId,
      number: json.number,
      url: json.html_url,
    });
    return { number: json.number, url: json.html_url };
  },
});
