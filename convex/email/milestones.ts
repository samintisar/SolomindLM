import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { EMAIL_EVENTS, type EmailEventName } from "./events";

export const getEmailForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.email ?? null;
  },
});

export async function userEmail(ctx: MutationCtx, userId: Id<"users">): Promise<string | null> {
  const user = await ctx.db.get(userId);
  return user?.email ?? null;
}

async function scheduleEmit(
  ctx: MutationCtx,
  event: EmailEventName,
  email: string,
  payload: Record<string, string | number | boolean>
) {
  const suppressed = await ctx.db
    .query("emailSuppressions")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (suppressed) return;
  await ctx.scheduler.runAfter(0, internal.email.emit.emit, { event, email, payload });
}

async function getOnboardingRow(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("userOnboarding")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function emitUserCreatedIfNeeded(ctx: MutationCtx, userId: Id<"users">) {
  const email = await userEmail(ctx, userId);
  if (!email) return;
  await scheduleEmit(ctx, EMAIL_EVENTS.userCreated, email, { userId: String(userId) });
}

export async function emitNotebookCreatedIfNeeded(ctx: MutationCtx, userId: Id<"users">) {
  const row = await getOnboardingRow(ctx, userId);
  if (!row || row.emittedNotebookCreated) return;
  const email = await userEmail(ctx, userId);
  await ctx.db.patch(row._id, { emittedNotebookCreated: true });
  if (!email) return;
  await scheduleEmit(ctx, EMAIL_EVENTS.notebookCreated, email, { userId: String(userId) });
}

export async function emitSourceAddedIfNeeded(ctx: MutationCtx, userId: Id<"users">) {
  const row = await getOnboardingRow(ctx, userId);
  if (!row || row.emittedSourceAdded) return;
  const email = await userEmail(ctx, userId);
  await ctx.db.patch(row._id, { emittedSourceAdded: true });
  if (!email) return;
  await scheduleEmit(ctx, EMAIL_EVENTS.sourceAdded, email, { userId: String(userId) });
}

export async function emitArtifactGeneratedIfNeeded(ctx: MutationCtx, userId: Id<"users">) {
  const row = await getOnboardingRow(ctx, userId);
  if (!row || row.emittedArtifactGenerated) return;
  const email = await userEmail(ctx, userId);
  await ctx.db.patch(row._id, { emittedArtifactGenerated: true });
  if (!email) return;
  await scheduleEmit(ctx, EMAIL_EVENTS.artifactGenerated, email, { userId: String(userId) });
}

export async function emitOnboardingCompletedIfNeeded(ctx: MutationCtx, userId: Id<"users">) {
  const row = await getOnboardingRow(ctx, userId);
  if (!row || row.emittedOnboardingCompleted) return;
  const email = await userEmail(ctx, userId);
  await ctx.db.patch(row._id, { emittedOnboardingCompleted: true });
  if (!email) return;
  await scheduleEmit(ctx, EMAIL_EVENTS.onboardingCompleted, email, { userId: String(userId) });
}

export async function emitNamedEvent(
  ctx: MutationCtx,
  event: EmailEventName,
  email: string,
  payload: Record<string, string | number | boolean> = {}
) {
  await scheduleEmit(ctx, event, email, payload);
}
