import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { env } from "./env";

/** Split "a@x.com, b@y.com" into a trimmed, lowercased, blank-free list. */
export function parseAdminEmails(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** True when `email` is on the allowlist (defaults to the env allowlist). */
export function isFeedbackAdminEmail(
  email: string | undefined | null,
  raw: string = env.FEEDBACK_ADMIN_EMAILS
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.toLowerCase());
}

/** Throws unless the given user's email is on the feedback-admin allowlist. */
export async function assertFeedbackAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!isFeedbackAdminEmail(user?.email ?? undefined)) {
    throw new Error("Not authorized: feedback admin only");
  }
}
