import type {
  SubscriptionStatusResponse,
  CheckoutSessionResponse,
  SubscriptionInterval,
} from "../types";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Get subscription status for current user
 */
export function useSubscriptionStatus(): SubscriptionStatusResponse {
  const subscription = useQuery(api.billing.index.getCurrent);

  if (!subscription) {
    return {
      hasSubscription: false,
      plan: "free",
      notebookLimit: 5,
      sourceLimit: 200,
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

  return {
    hasSubscription: subscription.status === "active",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: subscription.status as any,
    plan: subscription.status === "active" ? "premium" : "free",
    notebookLimit: subscription.status === "active" ? 100 : 5,
    sourceLimit: 200,
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
 * Reactivate subscription (if canceled but still active)
 */
export function useReactivateSubscription() {
  const reactivate = useAction(api.billing.index.removeCancelAtPeriodEnd);

  return async () => {
    return await reactivate({});
  };
}

/**
 * Create customer portal session
 */
export function useCreatePortalSession() {
  const create = useAction(api.billing.index.createPortalSession);

  return async (returnUrl: string): Promise<{ url: string }> => {
    const result = await create({ returnUrl });
    return { url: result.url };
  };
}

/**
 * Check if user is subscribed (convenience hook)
 */
export function useIsSubscribed(): boolean {
  const subscription = useQuery(api.billing.index.getCurrent);
  return subscription?.status === "active" || false;
}

/**
 * Get limits for current user (convenience hook)
 */
export function useUserLimits() {
  const subscription = useQuery(api.billing.index.getCurrent);

  if (subscription?.status === "active") {
    return {
      notebookLimit: 100,
      sourceLimit: 200,
      isPremium: true,
    };
  }

  return {
    notebookLimit: 5,
    sourceLimit: 200,
    isPremium: false,
  };
}
