import type {
  SubscriptionStatusResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
} from '../types';
import { apiGet, apiPost } from '@/shared/utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get userId from localStorage (for transition period)
 * TODO: Replace with proper auth context after migration
 */
function getUserId(): string | null {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return user.id || user.user?.id || null;
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================
// Subscription API Service
// ============================================================

export const subscriptionApi = {
  /**
   * Get subscription status for current user
   */
  async getStatus(): Promise<SubscriptionStatusResponse> {
    const userId = getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await apiGet(`/api/subscriptions/status?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to get subscription status');
    }

    return response.json();
  },

  /**
   * Create a Stripe Checkout session
   */
  async createCheckout(
    interval: 'month' | 'year',
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionResponse> {
    const userId = getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const requestBody: any = {
      interval,
      successUrl,
      cancelUrl,
      userId, // Include userId in body for validation
    };

    const response = await apiPost('/api/subscriptions/create-checkout', requestBody);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    return response.json();
  },

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(): Promise<void> {
    const userId = getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const params = new URLSearchParams({ userId });
    const response = await fetch(`${API_BASE_URL}/api/subscriptions/cancel?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to cancel subscription');
    }
  },

  /**
   * Create customer portal session
   */
  async createPortalSession(returnUrl: string): Promise<{ url: string }> {
    const userId = getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const response = await apiPost('/api/subscriptions/portal', { userId, returnUrl });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to create portal session');
    }

    return response.json();
  },
};
