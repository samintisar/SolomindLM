import type {
  SubscriptionStatusResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  SubscriptionInterval,
} from '../types';
import { useQuery, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';

/**
 * Get subscription status for current user
 */
export function useSubscriptionStatus(): SubscriptionStatusResponse {
  const subscription = useQuery(api.subscriptions.getCurrent);

  if (!subscription) {
    return {
      hasSubscription: false,
      plan: 'free',
      notebookLimit: 5,
      sourceLimit: 20,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    hasSubscription: subscription.status === 'active',
    status: subscription.status as any,
    plan: subscription.status === 'active' ? 'premium' : 'free',
    notebookLimit: subscription.status === 'active' ? 100 : 5,
    sourceLimit: subscription.status === 'active' ? 500 : 20,
    currentPeriodEnd: new Date(subscription.currentPeriodEnd * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    interval: subscription.interval as SubscriptionInterval,
    amount: subscription.amount,
  };
}

/**
 * Create a Stripe Checkout session
 */
export function useCreateCheckout() {
  const create = useAction(api.subscriptions.createCheckoutSession);

  return async (
    interval: 'month' | 'year',
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
  const cancel = useAction(api.subscriptions.cancelAtPeriodEnd);

  return async () => {
    return await cancel({});
  };
}

/**
 * Reactivate subscription (if canceled but still active)
 */
export function useReactivateSubscription() {
  const reactivate = useAction(api.subscriptions.removeCancelAtPeriodEnd);

  return async () => {
    return await reactivate({});
  };
}

/**
 * Create customer portal session
 */
export function useCreatePortalSession() {
  const create = useAction(api.subscriptions.createPortalSession);

  return async (returnUrl: string): Promise<{ url: string }> => {
    const result = await create({ returnUrl });
    return { url: result.url };
  };
}

/**
 * Check if user is subscribed (convenience hook)
 */
export function useIsSubscribed(): boolean {
  const subscription = useQuery(api.subscriptions.getCurrent);
  return subscription?.status === 'active' || false;
}

/**
 * Get limits for current user (convenience hook)
 */
export function useUserLimits() {
  const subscription = useQuery(api.subscriptions.getCurrent);

  if (subscription?.status === 'active') {
    return {
      notebookLimit: 100,
      sourceLimit: 500,
      isPremium: true,
    };
  }

  return {
    notebookLimit: 5,
    sourceLimit: 20,
    isPremium: false,
  };
}

// ============================================================
// Legacy API object for backward compatibility
// ============================================================

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks instead
 */
export const subscriptionApi = {
  // Hooks
  useSubscriptionStatus,
  useCreateCheckout,
  useCancelSubscription,
  useReactivateSubscription,
  useCreatePortalSession,
  useIsSubscribed,
  useUserLimits,

  // Legacy methods (deprecated)
  getStatus: useSubscriptionStatus,
  createCheckout: useCreateCheckout,
  cancelSubscription: useCancelSubscription,
  createPortalSession: useCreatePortalSession,
};
