import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { getAuthUserId } from "../auth";
import { internalMutation, mutation } from "../functions";
import {
  type AppStoreStatus,
  appStoreStatusValidator,
  ENTITLEMENT_LEEWAY_MS,
  isAppStoreEntitled,
  isOlderThan,
  mergeStatus,
  signInAgainError,
  statusFromNotification,
  statusFromTransaction,
  type VerifiedRenewal,
  type VerifiedTransaction,
  verifiedRenewalValidator,
  verifiedTransactionValidator,
} from "./appStoreModel";

/**
 * Sandbox purchases (TestFlight, App Review) cost nothing, so they only grant Pro to accounts the
 * deployment allows: `APP_STORE_SANDBOX_ACCESS` is "all" or a comma-separated email allowlist
 * (the App Review demo account, testers). Unset: nobody.
 */
async function sandboxAllowed(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const raw = (process.env.APP_STORE_SANDBOX_ACCESS ?? "").trim().toLowerCase();
  if (raw === "all") return true;
  const email = (await ctx.db.get(userId))?.email?.toLowerCase();
  if (!email) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .includes(email);
}

/**
 * Cached queries (`getPlan`) only recompute on writes, so touch the row when its access runs out
 * even if Apple's EXPIRED notification never arrives.
 */
async function scheduleLapseCheck(
  ctx: MutationCtx,
  subscriptionId: Id<"appStoreSubscriptions">,
  row: { status: AppStoreStatus; expiresAt: number; gracePeriodExpiresAt?: number }
) {
  if (row.status !== "active" && row.status !== "grace") return;
  const accessUntil = Math.max(row.expiresAt, row.gracePeriodExpiresAt ?? 0);
  await ctx.scheduler.runAt(
    accessUntil + ENTITLEMENT_LEEWAY_MS + 1000,
    internal.billing.appStore.expireIfLapsed,
    { subscriptionId }
  );
}

export const expireIfLapsed = internalMutation({
  args: { subscriptionId: v.id("appStoreSubscriptions") },
  returns: v.null(),
  handler: async (ctx, { subscriptionId }) => {
    const row = await ctx.db.get(subscriptionId);
    const lapsed =
      row &&
      (row.status === "active" || row.status === "grace") &&
      !isAppStoreEntitled(row, Date.now());
    if (lapsed) await ctx.db.patch(row._id, { status: "expired", updatedAt: Date.now() });
    return null;
  },
});

/** The caller's appAccountToken, created on first use. */
export const getAccountToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw signInAgainError();
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
    if (transaction.environment === "Sandbox" && !(await sandboxAllowed(ctx, userId))) {
      throw toConvexError(
        new InputValidationError("Test purchases don't unlock Pro on this account.", {
          field: "environment",
        })
      );
    }
    const tokenOwner = transaction.appAccountToken
      ? await findTokenOwner(ctx, transaction.appAccountToken)
      : null;
    if (tokenOwner && tokenOwner !== userId) throw linkedElsewhereError();
    const existing = await findByOriginalTransaction(ctx, transaction.originalTransactionId);
    // Apple keeps one originalTransactionId per Apple ID across resubscribes, so a lapsed row
    // may move to the account that bought again (its token proves who bought).
    const reassign = existing !== null && existing.userId !== userId;
    if (reassign && !(tokenOwner === userId && !isAppStoreEntitled(existing, now))) {
      throw linkedElsewhereError();
    }

    const fromTransaction = statusFromTransaction(transaction, now);

    if (existing) {
      // Restores and replays can deliver an older period; never roll back.
      if (isOlderThan(existing, transaction)) return { status: existing.status };
      // Signed transactions never expire, so a replayed pre-refund one must not undo a refund;
      // only a notification (REFUND_REVERSED) can.
      if (
        existing.status === "revoked" &&
        transaction.revokedAt === undefined &&
        transaction.expiresAt <= existing.expiresAt
      ) {
        return { status: "revoked" as const };
      }
      const status = mergeStatus(existing.status, fromTransaction);
      // A new period (renewal, resubscribe) or a new owner: the old renewal state no longer
      // applies. A renewal means auto-renew was on; the next notification corrects it if not.
      const freshRenewal = reassign || transaction.expiresAt > existing.expiresAt;
      const fields = {
        ...(reassign ? { userId } : {}),
        ...(freshRenewal
          ? { autoRenews: true, autoRenewProductId: undefined, gracePeriodExpiresAt: undefined }
          : {}),
        latestTransactionId: transaction.transactionId,
        productId: transaction.productId,
        environment: transaction.environment,
        expiresAt: transaction.expiresAt,
        status,
        updatedAt: now,
      };
      await ctx.db.patch(existing._id, fields);
      await scheduleLapseCheck(ctx, existing._id, { ...existing, ...fields });
      return { status };
    }

    const insertedId = await ctx.db.insert("appStoreSubscriptions", {
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
    await scheduleLapseCheck(ctx, insertedId, {
      status: fromTransaction,
      expiresAt: transaction.expiresAt,
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

async function markProcessed(ctx: MutationCtx, notificationUUID: string) {
  const row = await findNotification(ctx, notificationUUID);
  if (row) {
    await ctx.db.patch(row._id, {
      processed: true,
      processedAt: Date.now(),
      errorMessage: undefined,
    });
  }
}

export const markNotificationProcessed = internalMutation({
  args: { notificationUUID: v.string() },
  returns: v.null(),
  handler: async (ctx, { notificationUUID }) => {
    await markProcessed(ctx, notificationUUID);
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
    notificationUUID: v.string(),
    notificationType: v.string(),
    subtype: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    transaction: verifiedTransactionValidator,
    renewal: v.optional(verifiedRenewalValidator),
  },
  returns: v.object({ applied: v.boolean() }),
  handler: async (
    ctx,
    { notificationUUID, notificationType, subtype, signedAt, transaction, renewal }
  ) => {
    const result = await applyNotificationState(ctx, {
      notificationType,
      subtype,
      signedAt,
      transaction,
      renewal,
    });
    // Same mutation as the state change, so a crash can't leave it applied but unmarked.
    await markProcessed(ctx, notificationUUID);
    return result;
  },
});

async function applyNotificationState(
  ctx: MutationCtx,
  {
    notificationType,
    subtype,
    signedAt,
    transaction,
    renewal,
  }: {
    notificationType: string;
    subtype?: string;
    signedAt?: number;
    transaction: VerifiedTransaction;
    renewal?: VerifiedRenewal;
  }
): Promise<{ applied: boolean }> {
  const now = Date.now();
  const existing = await findByOriginalTransaction(ctx, transaction.originalTransactionId);
  // Stale data (older period) changes nothing, but counts as handled.
  if (existing && isOlderThan(existing, transaction)) return { applied: true };
  // Same period but signed before the last applied notification (an Apple retry or a late
  // delivery, e.g. DID_RENEW after REFUND): also stale.
  if (
    existing?.lastNotificationSignedAt !== undefined &&
    signedAt !== undefined &&
    signedAt < existing.lastNotificationSignedAt
  ) {
    return { applied: true };
  }
  const tokenOwner = transaction.appAccountToken
    ? await findTokenOwner(ctx, transaction.appAccountToken)
    : null;
  // A lapsed row on a shared Apple ID moves to whoever bought again; an entitled one keeps its owner.
  const reassign =
    existing !== null &&
    tokenOwner !== null &&
    tokenOwner !== existing.userId &&
    !isAppStoreEntitled(existing, now);
  const userId = reassign ? tokenOwner : (existing?.userId ?? tokenOwner);
  if (!userId) return { applied: false };
  if (transaction.environment === "Sandbox" && !(await sandboxAllowed(ctx, userId))) {
    return { applied: false };
  }

  const fromTransaction = statusFromTransaction(transaction, now);
  const status =
    statusFromNotification(notificationType, subtype) ??
    mergeStatus(existing?.status, fromTransaction);
  const fields = {
    ...(reassign ? { userId } : {}),
    ...(signedAt !== undefined ? { lastNotificationSignedAt: signedAt } : {}),
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
    await scheduleLapseCheck(ctx, existing._id, { ...existing, ...fields });
  } else {
    const insertedId = await ctx.db.insert("appStoreSubscriptions", {
      userId,
      originalTransactionId: transaction.originalTransactionId,
      createdAt: now,
      ...fields,
      autoRenews: renewal?.autoRenews ?? true,
    });
    await scheduleLapseCheck(ctx, insertedId, fields);
  }
  return { applied: true };
}
