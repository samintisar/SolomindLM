import { api } from "@convex/_generated/api";
import { appStoreProductPeriod, isAppStoreProductId } from "@convex/billing/appStoreProducts";
import { useAction, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { purchaseChannel } from "@/utils/platformDetection";
import type {
  CheckoutSessionResponse,
  SubscriptionInterval,
  SubscriptionStatusResponse,
} from "../types";

/** Backstop: Stripe checkout and portal only on the web, never inside the native app. */
function assertPurchasesAllowed() {
  if (purchaseChannel() !== "stripe") {
    throw new Error("Subscriptions can't be purchased or changed in the app.");
  }
}

/**
 * Get subscription status for current user
 */
export function useSubscriptionStatus(): SubscriptionStatusResponse {
  const plan = useQuery(api.billing.index.getPlan);

  // Memoized so consumers (and context values built from this) keep identity between renders.
  return useMemo((): SubscriptionStatusResponse => {
    if (plan?.source === "app_store" && plan.appStore) {
      const { productId, expiresAt, autoRenews } = plan.appStore;
      return {
        hasSubscription: true,
        isLoading: false,
        source: "app_store",
        status: "active",
        plan: "premium",
        notebookLimit: 200,
        sourceLimit: 200,
        currentPeriodEnd: new Date(expiresAt).toISOString(),
        cancelAtPeriodEnd: !autoRenews,
        interval: isAppStoreProductId(productId) ? appStoreProductPeriod(productId) : "month",
        appStoreProductId: productId,
      };
    }

    const subscription = plan?.stripe ?? null;
    if (!subscription) {
      return {
        hasSubscription: false,
        isLoading: plan === undefined,
        source: null,
        plan: "free",
        notebookLimit: 5,
        sourceLimit: 20,
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
      source: "stripe",
      hasSubscription: subscription.status === "active",
      status: subscription.status as SubscriptionStatusResponse["status"],
      plan: subscription.status === "active" ? "premium" : "free",
      notebookLimit: subscription.status === "active" ? 200 : 5,
      sourceLimit: subscription.status === "active" ? 200 : 20,
      currentPeriodEnd: currentPeriodEndIso ?? undefined,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      interval: subscription.interval as SubscriptionInterval,
      amount: subscription.amount,
    };
  }, [plan]);
}

/**
 * Create a Stripe Checkout session
 */
export function useCreateCheckout() {
  const create = useAction(api.billing.index.createCheckoutSession);

  return useCallback(
    async (
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
    },
    [create]
  );
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
  const plan = useQuery(api.billing.index.getPlan);
  // `undefined` until the query resolves; callers gate on `isLoading` so a Pro user never sees
  // the free cap flash.
  const isLoading = plan === undefined;

  if (plan?.tier === "pro") {
    return { notebookLimit: 200, sourceLimit: 200, isPremium: true, isLoading: false };
  }
  return { notebookLimit: 5, sourceLimit: 20, isPremium: false, isLoading };
}
