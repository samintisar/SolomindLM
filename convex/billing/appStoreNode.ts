"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import { ExternalServiceError, InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { getAuthUserId } from "../auth";
import {
  type AppStoreStatus,
  appStoreStatusValidator,
  type VerifiedTransaction,
} from "./appStoreModel";
import { isAppStoreProductId } from "./appStoreProducts";
import {
  AppStoreVerificationError,
  verifyNotification,
  verifyTransaction,
} from "./appStoreVerifier";

/**
 * Called by the iOS shell after a purchase or restore, before it finishes the StoreKit
 * transaction. Verifies Apple's signature, then stores the subscription for the caller.
 */
export const syncTransaction = action({
  args: { signedTransaction: v.string() },
  returns: v.object({ status: appStoreStatusValidator }),
  handler: async (ctx, { signedTransaction }): Promise<{ status: AppStoreStatus }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    let transaction: VerifiedTransaction;
    try {
      transaction = await verifyTransaction(signedTransaction);
    } catch (error) {
      if (error instanceof AppStoreVerificationError) {
        throw toConvexError(
          new InputValidationError("This purchase couldn't be verified.", {
            field: "signedTransaction",
          })
        );
      }
      // Transient Apple/OCSP failure: give the client a structured, retryable error.
      if (error instanceof ExternalServiceError) throw toConvexError(error);
      throw error;
    }
    if (!isAppStoreProductId(transaction.productId)) {
      throw toConvexError(new InputValidationError("Unknown product", { field: "productId" }));
    }
    return await ctx.runMutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction,
    });
  },
});

type NotificationResult = "invalid" | "duplicate" | "ignored" | "unlinked" | "processed";

/**
 * Handle one App Store Server Notification V2. Returns a result for the HTTP route; throws when
 * processing fails (including transient verification failures) so the route answers 500 and
 * Apple retries.
 */
export const handleNotification = internalAction({
  args: { signedPayload: v.string() },
  returns: v.object({
    result: v.union(
      v.literal("invalid"),
      v.literal("duplicate"),
      v.literal("ignored"),
      v.literal("unlinked"),
      v.literal("processed")
    ),
  }),
  handler: async (ctx, { signedPayload }): Promise<{ result: NotificationResult }> => {
    let notification: Awaited<ReturnType<typeof verifyNotification>>;
    try {
      notification = await verifyNotification(signedPayload);
    } catch (error) {
      if (error instanceof AppStoreVerificationError) {
        console.warn(
          JSON.stringify({ event: "appstore_notification_invalid", error: error.message })
        );
        return { result: "invalid" as const };
      }
      throw error;
    }

    const { notificationUUID, notificationType, subtype, transaction, renewal } = notification;
    const { status } = await ctx.runMutation(internal.billing.appStore.claimNotification, {
      notificationUUID,
      notificationType,
    });
    if (status === "processed") return { result: "duplicate" as const };
    if (status === "in_flight") {
      throw new Error(`App Store notification ${notificationUUID} already in flight, retry later`);
    }

    try {
      if (!transaction || !isAppStoreProductId(transaction.productId)) {
        await ctx.runMutation(internal.billing.appStore.markNotificationProcessed, {
          notificationUUID,
        });
        return { result: "ignored" as const };
      }
      const { applied } = await ctx.runMutation(internal.billing.appStore.applyNotification, {
        notificationType,
        ...(subtype ? { subtype } : {}),
        transaction,
        ...(renewal ? { renewal } : {}),
      });
      await ctx.runMutation(internal.billing.appStore.markNotificationProcessed, {
        notificationUUID,
      });
      if (!applied) {
        console.warn(
          JSON.stringify({
            event: "appstore_notification_unlinked",
            notificationUUID,
            notificationType,
            originalTransactionId: transaction.originalTransactionId,
          })
        );
      }
      return { result: applied ? ("processed" as const) : ("unlinked" as const) };
    } catch (error) {
      await ctx.runMutation(internal.billing.appStore.markNotificationFailed, {
        notificationUUID,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
