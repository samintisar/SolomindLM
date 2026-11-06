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

/** A recent unprocessed claim is treated as still running (same idea as Stripe's webhook claim). */
const NOTIFICATION_IN_FLIGHT_WINDOW_MS = 2 * 60 * 1000;

async function findNotification(ctx: MutationCtx, notificationUUID: string) {
  return ctx.db
    .query("appStoreNotificationEvents")
    .withIndex("by_uuid", (q) => q.eq("notificationUUID", notificationUUID))
    .first();
}

/**
 * Claim an App Store notification before handling it. Apple retries and can redeliver while an
 * earlier attempt still runs: "processed" → skip, "in_flight" → fail so Apple retries later.
 */
export const claimNotification = internalMutation({
  args: { notificationUUID: v.string(), notificationType: v.string() },
  returns: v.object({
    status: v.union(v.literal("new"), v.literal("processed"), v.literal("in_flight")),
  }),
  handler: async (ctx, args) => {
    const existing = await findNotification(ctx, args.notificationUUID);
    const now = Date.now();
    if (existing) {
      if (existing.processed) return { status: "processed" as const };
      const priorAttemptFailed = existing.errorMessage != null;
      if (!priorAttemptFailed && now - existing.createdAt < NOTIFICATION_IN_FLIGHT_WINDOW_MS) {
        return { status: "in_flight" as const };
      }
      await ctx.db.patch(existing._id, { createdAt: now, errorMessage: undefined });
      return { status: "new" as const };
    }
    await ctx.db.insert("appStoreNotificationEvents", {
      notificationUUID: args.notificationUUID,
      notificationType: args.notificationType,
      processed: false,
      createdAt: now,
    });
    return { status: "new" as const };
  },
});

export const markNotificationProcessed = internalMutation({
  args: { notificationUUID: v.string() },
  returns: v.null(),
  handler: async (ctx, { notificationUUID }) => {
    const row = await findNotification(ctx, notificationUUID);
    if (row) {
      await ctx.db.patch(row._id, {
        processed: true,
        processedAt: Date.now(),
        errorMessage: undefined,
      });
    }
    return null;
  },
});

export const markNotificationFailed = internalMutation({
  args: { notificationUUID: v.string(), errorMessage: v.string() },
  returns: v.null(),
  handler: async (ctx, { notificationUUID, errorMessage }) => {
    const row = await findNotification(ctx, notificationUUID);
    if (row) await ctx.db.patch(row._id, { errorMessage });
    return null;
  },
});

/**
 * Apply a verified notification's transaction and renewal info. Finds the subscription by
 * originalTransactionId, else the user by appAccountToken; `applied: false` when neither is known.
 */
export const applyNotification = internalMutation({
  args: {
    notificationType: v.string(),
    subtype: v.optional(v.string()),
    transaction: verifiedTransactionValidator,
    renewal: v.optional(verifiedRenewalValidator),
  },
  returns: v.object({ applied: v.boolean() }),
  handler: async (ctx, { notificationType, subtype, transaction, renewal }) => {
    const now = Date.now();
    const existing = await findByOriginalTransaction(ctx, transaction.originalTransactionId);
    const userId =
      existing?.userId ??
      (transaction.appAccountToken ? await findTokenOwner(ctx, transaction.appAccountToken) : null);
    if (!userId) return { applied: false };

    const fromTransaction = statusFromTransaction(transaction, now);
    const status =
      statusFromNotification(notificationType, subtype) ??
      mergeStatus(existing?.status, fromTransaction);
    const fields = {
      latestTransactionId: transaction.transactionId,
      productId: transaction.productId,
      environment: transaction.environment,
      expiresAt: transaction.expiresAt,
      status,
      updatedAt: now,
      ...(renewal
        ? {
            autoRenews: renewal.autoRenews,
            autoRenewProductId: renewal.autoRenewProductId,
            gracePeriodExpiresAt: renewal.gracePeriodExpiresAt,
          }
        : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("appStoreSubscriptions", {
        userId,
        originalTransactionId: transaction.originalTransactionId,
        createdAt: now,
        ...fields,
        autoRenews: renewal?.autoRenews ?? true,
      });
    }
    return { applied: true };
  },
});
