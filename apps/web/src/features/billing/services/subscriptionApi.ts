import { api } from "@convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { canOfferPurchases } from "@/utils/platformDetection";
import type {
  CheckoutSessionResponse,
  SubscriptionInterval,
  SubscriptionStatusResponse,
} from "../types";

const FREE_LIMITS = { notebookLimit: 5, sourceLimit: 20 };
const PRO_LIMITS = { notebookLimit: 200, sourceLimit: 200 };

/** Backstop for canOfferPurchases: no Stripe checkout or portal from the native app. */
function assertPurchasesAllowed() {
  if (!canOfferPurchases()) {
    throw new Error("Subscriptions can't be purchased or changed in the app.");
  }
}

/**
 * Get subscription status for current user
 */
export function useSubscriptionStatus(): SubscriptionStatusResponse {
  const subscription = useQuery(api.billing.index.getCurrent);

  if (!subscription) {
    return {
      hasSubscription: false,
      isLoading: subscription === undefined,
      plan: "free",
      ...FREE_LIMITS,
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
    };
  }

  // Backend stores period start/end in milliseconds (Stripe seconds * 1000).
  const periodEndMs = subscription.currentPeriodEnd;
  let periodEndDate: Date | null =
    typeof periodEndMs === "number" && Number.isFinite(periodEndMs) && periodEndMs > 0
      ? new Date(periodEndMs)
      : null;
  // Fallback: if end is missing (e.g. old record), derive from period start + interval
  if (!periodEndDate || !Number.isFinite(periodEndDate.getTime())) {
    const periodStartMs = subscription.currentPeriodStart;
    const startMs =
      typeof periodStartMs === "number" && Number.isFinite(periodStartMs) && periodStartMs > 0
        ? periodStartMs
        : (subscription as { createdAt?: number }).createdAt;
    if (typeof startMs === "number" && Number.isFinite(startMs) && startMs > 0) {
      const start = new Date(startMs);
      const interval = (subscription.interval as string) || "month";
      const end = new Date(start);
      if (interval === "year") {
        end.setFullYear(end.getFullYear() + 1);
      } else {
        end.setMonth(end.getMonth() + 1);
      }
      periodEndDate = end;
    }
  }
  let currentPeriodEndIso: string | null = null;
  if (periodEndDate && Number.isFinite(periodEndDate.getTime())) {
    try {
      currentPeriodEndIso = periodEndDate.toISOString();
    } catch {
      currentPeriodEndIso = null;
    }
  }

  const active = subscription.status === "active";
  return {
    hasSubscription: active,
    status: subscription.status as any,
    plan: active ? "premium" : "free",
    ...(active ? PRO_LIMITS : FREE_LIMITS),
    currentPeriodEnd: currentPeriodEndIso ?? undefined,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    interval: subscription.interval as SubscriptionInterval,
    amount: subscription.amount,
  };
}

/**
 * Create a Stripe Checkout session
 */
export function useCreateCheckout() {
  const create = useAction(api.billing.index.createCheckoutSession);

  return async (
    interval: "month" | "year",
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionResponse> => {
    assertPurchasesAllowed();
    const result = await create({
      interval,
      successUrl,
      cancelUrl,
    });

    return {
      url: result.url,
      sessionId: result.sessionId,
    };
  };
}

/**
 * Cancel subscription at period end
 */
export function useCancelSubscription() {
  const cancel = useAction(api.billing.index.cancelAtPeriodEnd);

  return async () => {
    return await cancel({});
  };
}

/**
 * Create customer portal session
 */
export function useCreatePortalSession() {
  const create = useAction(api.billing.index.createPortalSession);

  return async (returnUrl: string): Promise<{ url: string }> => {
    assertPurchasesAllowed();
    const result = await create({ returnUrl });
    return { url: result.url };
  };
}

/**
 * Get limits for current user (convenience hook)
 */
export function useUserLimits() {
  const status = useSubscriptionStatus();
  const isPremium = status.plan === "premium";
  return {
    ...(isPremium ? PRO_LIMITS : FREE_LIMITS),
    isPremium,
    // True until the subscription query resolves. Callers must not treat the free cap as
    // authoritative during this window (it would flash "limit reached" at a Pro user).
    isLoading: status.isLoading === true,
  };
}
