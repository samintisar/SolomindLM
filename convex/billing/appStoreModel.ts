import { type Infer, v } from "convex/values";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";

/** Structured, so the app shows a real message instead of production's opaque "Server Error". */
export function signInAgainError() {
  return toConvexError(
    new InputValidationError("Sign in again to finish this purchase.", { field: "auth" })
  );
}

export const appStoreStatusValidator = v.union(
  v.literal("active"),
  v.literal("grace"),
  v.literal("billing_retry"),
  v.literal("expired"),
  v.literal("revoked")
);
export type AppStoreStatus = Infer<typeof appStoreStatusValidator>;

export const appStoreEnvironmentValidator = v.union(v.literal("Production"), v.literal("Sandbox"));

/** A signed transaction after Apple's signature check, in our own shape. */
export const verifiedTransactionValidator = v.object({
  environment: appStoreEnvironmentValidator,
  originalTransactionId: v.string(),
  transactionId: v.string(),
  productId: v.string(),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  /** Lower-cased. */
  appAccountToken: v.optional(v.string()),
});
export type VerifiedTransaction = Infer<typeof verifiedTransactionValidator>;

export const verifiedRenewalValidator = v.object({
  autoRenews: v.boolean(),
  autoRenewProductId: v.optional(v.string()),
  gracePeriodExpiresAt: v.optional(v.number()),
});
export type VerifiedRenewal = Infer<typeof verifiedRenewalValidator>;

export interface VerifiedNotification {
  notificationUUID: string;
  notificationType: string;
  subtype?: string;
  /** Apple's `signedDate` (ms); retries keep the original, so it orders notifications. */
  signedAt?: number;
  environment: VerifiedTransaction["environment"];
  transaction?: VerifiedTransaction;
  renewal?: VerifiedRenewal;
}

/** Covers a renewal notification that arrives late; also bounds a missed EXPIRED notification. */
export const ENTITLEMENT_LEEWAY_MS = 24 * 60 * 60 * 1000;

export function statusFromTransaction(
  tx: { expiresAt: number; revokedAt?: number },
  now: number
): AppStoreStatus {
  if (tx.revokedAt !== undefined) return "revoked";
  return tx.expiresAt > now ? "active" : "expired";
}

/** The status an App Store Server Notification sets, or undefined when it leaves it alone. */
export function statusFromNotification(
  notificationType: string,
  subtype: string | undefined
): AppStoreStatus | undefined {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
      return "active";
    case "DID_FAIL_TO_RENEW":
      return subtype === "GRACE_PERIOD" ? "grace" : "billing_retry";
    case "GRACE_PERIOD_EXPIRED":
      return "billing_retry";
    case "EXPIRED":
      return "expired";
    case "REFUND":
    case "REVOKE":
      return "revoked";
    default:
      return undefined;
  }
}

/**
 * A transaction on its own can only say active / expired / revoked. Grace and billing retry come
 * from notifications, so an expired transaction must not overwrite them.
 */
export function mergeStatus(
  existing: AppStoreStatus | undefined,
  fromTransaction: AppStoreStatus
): AppStoreStatus {
  if (fromTransaction === "expired" && (existing === "grace" || existing === "billing_retry")) {
    return existing;
  }
  return fromTransaction;
}

export function isAppStoreEntitled(
  row: { status: AppStoreStatus; expiresAt: number; gracePeriodExpiresAt?: number },
  now: number
): boolean {
  if (row.status !== "active" && row.status !== "grace") return false;
  const accessUntil = Math.max(row.expiresAt, row.gracePeriodExpiresAt ?? 0);
  return accessUntil + ENTITLEMENT_LEEWAY_MS > now;
}

/**
 * True when the incoming transaction describes an earlier period than the stored row. Notifications
 * arrive out of order and signed data can be replayed, so such data must not change the row, even
 * when it is a refund (a refund of the current period has an equal expiry and still applies).
 */
export function isOlderThan(
  existing: { expiresAt: number },
  transaction: { expiresAt: number }
): boolean {
  return transaction.expiresAt < existing.expiresAt;
}
