import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { getAuthUserId } from "../auth";
import { internalMutation, mutation } from "../functions";
import {
  appStoreStatusValidator,
  mergeStatus,
  statusFromNotification,
  statusFromTransaction,
  verifiedRenewalValidator,
  verifiedTransactionValidator,
} from "./appStoreModel";

/** The caller's appAccountToken, created on first use. */
export const getAccountToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const existing = await ctx.db
      .query("appStoreAccountTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing.token;
    const token = crypto.randomUUID();
    await ctx.db.insert("appStoreAccountTokens", { userId, token, createdAt: Date.now() });
    return token;
  },
});

function linkedElsewhereError() {
  return toConvexError(
    new InputValidationError(
      "This Apple ID's subscription is linked to another SolomindLM account.",
      { field: "appAccountToken" }
    )
  );
}

async function findByOriginalTransaction(
  ctx: MutationCtx,
  originalTransactionId: string
): Promise<Doc<"appStoreSubscriptions"> | null> {
  return ctx.db
    .query("appStoreSubscriptions")
    .withIndex("by_original_transaction", (q) =>
      q.eq("originalTransactionId", originalTransactionId)
    )
    .first();
}

async function findTokenOwner(ctx: MutationCtx, token: string): Promise<Id<"users"> | null> {
  const row = await ctx.db
    .query("appStoreAccountTokens")
    .withIndex("by_token", (q) => q.eq("token", token.toLowerCase()))
    .first();
  return row?.userId ?? null;
}

/**
 * Store a transaction the app sent after Apple's signature check (`appStoreNode.syncTransaction`).
 * Refuses a purchase tied to another existing account; a token nobody owns (deleted account)
 * moves to the caller.
 */
export const applyVerifiedTransaction = internalMutation({
  args: { userId: v.id("users"), transaction: verifiedTransactionValidator },
  returns: v.object({ status: appStoreStatusValidator }),
  handler: async (ctx, { userId, transaction }) => {
    const now = Date.now();
    if (transaction.appAccountToken) {
      const owner = await findTokenOwner(ctx, transaction.appAccountToken);
      if (owner && owner !== userId) throw linkedElsewhereError();
    }
    const existing = await findByOriginalTransaction(ctx, transaction.originalTransactionId);
    if (existing && existing.userId !== userId) throw linkedElsewhereError();

    const fromTransaction = statusFromTransaction(transaction, now);

    if (existing) {
      // Restores can deliver an older transaction; never roll back to an earlier expiry.
      if (transaction.revokedAt === undefined && transaction.expiresAt < existing.expiresAt) {
        return { status: existing.status };
      }
      const status = mergeStatus(existing.status, fromTransaction);
      await ctx.db.patch(existing._id, {
        latestTransactionId: transaction.transactionId,
        productId: transaction.productId,
        environment: transaction.environment,
        expiresAt: transaction.expiresAt,
        status,
        updatedAt: now,
      });
      return { status };
    }

    await ctx.db.insert("appStoreSubscriptions", {
      userId,
      originalTransactionId: transaction.originalTransactionId,
      latestTransactionId: transaction.transactionId,
      productId: transaction.productId,
      environment: transaction.environment,
      status: fromTransaction,
      expiresAt: transaction.expiresAt,
      autoRenews: true,
      createdAt: now,
      updatedAt: now,
    });
    return { status: fromTransaction };
  },
});
