import { type Infer, v } from "convex/values";

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
