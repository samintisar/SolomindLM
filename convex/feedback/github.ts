import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, internalMutation } from "../_generated/server";
import { ExternalServiceError } from "../_lib/errors";
import { assertFeedbackAdmin } from "../_lib/feedbackAdmin";
import {
  type FeedbackType,
  feedbackIssueBody,
  feedbackIssueLabels,
  feedbackIssueTitle,
} from "../_model/feedback";
import { getAuthUserId } from "../auth";

/** How long a claimed-but-unfinished sync blocks a retry before it's considered dead. */
const SYNC_LOCK_MS = 2 * 60_000;

interface SyncPayload {
  type: FeedbackType;
  body: string;
  detail?: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  lastRequestId?: string;
}

/** Hidden marker embedded in the issue body so a crashed sync can find the issue it already filed. */
function feedbackIssueMarker(feedbackId: string): string {
  return `<!-- solomind-feedback:${feedbackId} -->`;
}

/**
 * Admin-gated claim of a feedback row for GitHub sync. Serializable, so two
 * racing syncs can't both proceed: the second sees the fresh `githubSyncStartedAt`
 * lock (or an already-recorded issue) and errors out. `recovering` is true when a
 * previous attempt claimed the row but never recorded an issue — the caller must
 * then look for an already-filed issue before creating a new one.
 */
export const claimForSync = internalMutation({
  args: { feedbackId: v.id("feedback"), callerUserId: v.id("users") },
  handler: async (ctx, args): Promise<{ payload: SyncPayload; recovering: boolean }> => {
    await assertFeedbackAdmin(ctx, args.callerUserId);
    const row = await ctx.db.get(args.feedbackId);
    if (!row) throw new Error("Feedback not found");
    if (row.githubIssueNumber != null) {
      throw new Error("This feedback already has a GitHub issue");
    }
    const now = Date.now();
    const priorClaim = row.githubSyncStartedAt ?? null;
    if (priorClaim != null && now - priorClaim < SYNC_LOCK_MS) {
      throw new Error("A GitHub sync for this feedback is already in progress");
    }
    await ctx.db.patch(args.feedbackId, { githubSyncStartedAt: now, updatedAt: now });
    return {
      payload: {
        type: row.type,
        body: row.body,
        detail: row.detail,
        route: row.route,
        planTier: row.planTier,
        surface: row.surface,
        appVersion: row.appVersion,
        lastRequestId: row.lastRequestId,
      },
      recovering: priorClaim != null,
    };
  },
});

export const attachGithubIssue = internalMutation({
  args: { feedbackId: v.id("feedback"), number: v.number(), url: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.feedbackId);
    if (!row) throw new Error("Feedback not found");
    // Re-check inside the mutation transaction: if two syncs raced past the
    // claimForSync guard, only the first write wins and the loser errors out
    // rather than clobbering the recorded issue.
    if (row.githubIssueNumber != null) {
      throw new Error("This feedback already has a GitHub issue");
    }
    await ctx.db.patch(args.feedbackId, {
      githubIssueNumber: args.number,
      githubIssueUrl: args.url,
      githubSyncStartedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

const githubHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "SolomindLM-feedback",
});

/** Best-effort lookup of an issue this row already filed (recovery from a crashed sync). */
async function findExistingIssue(
  repo: string,
  token: string,
  marker: string
): Promise<{ number: number; url: string } | null> {
  try {
    const q = encodeURIComponent(`repo:${repo} in:body "${marker}"`);
    const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=1`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{ number?: number; html_url?: string }>;
    };
    const hit = json.items?.[0];
    if (hit && typeof hit.number === "number" && typeof hit.html_url === "string") {
      return { number: hit.number, url: hit.html_url };
    }
    return null;
  } catch {
    return null;
  }
}

/** Record the issue on the row, retrying a few times so a transient failure doesn't orphan it. */
async function attachWithRetry(
  ctx: ActionCtx,
  feedbackId: Id<"feedback">,
  issue: { number: number; url: string }
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ctx.runMutation(internal.feedback.github.attachGithubIssue, {
        feedbackId,
        number: issue.number,
        url: issue.url,
      });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new ExternalServiceError(
    "GitHub",
    `Issue #${issue.number} was created but could not be recorded: ${
      lastErr instanceof Error ? lastErr.message : "unknown error"
    }`
  );
}

export const createGithubIssue = action({
  args: { feedbackId: v.id("feedback") },
  returns: v.object({ number: v.number(), url: v.string() }),
  handler: async (ctx, args): Promise<{ number: number; url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Read the token/repo directly from `process.env` (not the `env.ts`
    // module-eval snapshot) so tests and runtime config changes take effect.
    // Checked before claiming the row so a misconfig doesn't leave a lock behind.
    const token = process.env.FEEDBACK_GITHUB_TOKEN || "";
    if (!token) {
      throw new ExternalServiceError("GitHub", "FEEDBACK_GITHUB_TOKEN is not set");
    }
    const repo = process.env.FEEDBACK_GITHUB_REPO || "samintisar/SolomindLM";

    const { payload, recovering } = await ctx.runMutation(internal.feedback.github.claimForSync, {
      feedbackId: args.feedbackId,
      callerUserId: userId as Id<"users">,
    });

    const marker = feedbackIssueMarker(args.feedbackId);

    // A previous attempt claimed this row then died. It may already have filed
    // the issue before failing to record it — reuse that instead of duplicating.
    if (recovering) {
      const existing = await findExistingIssue(repo, token, marker);
      if (existing) {
        await attachWithRetry(ctx, args.feedbackId, existing);
        return existing;
      }
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({
        title: feedbackIssueTitle(payload.body),
        body: `${feedbackIssueBody(payload)}\n\n${marker}`,
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

    const issue = { number: json.number, url: json.html_url };
    await attachWithRetry(ctx, args.feedbackId, issue);
    return issue;
  },
});
