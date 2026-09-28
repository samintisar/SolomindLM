import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Scheduled (not awaited-for-delivery) from job-completion mutations so a slow or failing
 * push send never affects the mutation's own transaction.
 */
function schedulePush(
  ctx: MutationCtx,
  args: { userId: Id<"users">; title: string; body: string; data: Record<string, string> }
) {
  return ctx.scheduler.runAfter(0, internal.push.send.sendPushToUser, args);
}

const STUDIO_KIND_LABELS = {
  report: "Report ready",
  flashcards: "Flashcards ready",
  quiz: "Quiz ready",
  mindmap: "Mind map ready",
  spreadsheet: "Spreadsheet ready",
  writtenQuestions: "Written questions ready",
  audioOverview: "Audio overview ready",
  infographic: "Infographic ready",
} as const;

export type StudioJobKind = keyof typeof STUDIO_KIND_LABELS;

export function scheduleStudioJobCompletionPush(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    notebookId: Id<"notebooks">;
    itemId: string;
    kind: StudioJobKind;
    title?: string;
  }
) {
  return schedulePush(ctx, {
    userId: args.userId,
    title: STUDIO_KIND_LABELS[args.kind],
    body: args.title ? `"${args.title}" is ready to view.` : "Your generated content is ready.",
    data: { type: "studio", kind: args.kind, notebookId: args.notebookId, itemId: args.itemId },
  });
}

export function scheduleResearchRunCompletionPush(
  ctx: MutationCtx,
  args: { userId: Id<"users">; notebookId: Id<"notebooks">; runId: Id<"researchRuns"> }
) {
  return schedulePush(ctx, {
    userId: args.userId,
    title: "Deep research ready",
    body: "Your deep research run has finished.",
    data: { type: "research", notebookId: args.notebookId, runId: args.runId },
  });
}

export function scheduleLiteratureReviewCompletionPush(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    notebookId: Id<"notebooks">;
    sessionId: Id<"literatureReviewSessions">;
  }
) {
  return schedulePush(ctx, {
    userId: args.userId,
    title: "Literature review ready",
    body: "Your literature review has finished.",
    data: { type: "literatureReview", notebookId: args.notebookId, sessionId: args.sessionId },
  });
}
