import type {
  SubscriptionStatusResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get auth headers for API requests
 */
function getAuthHeaders(): HeadersInit {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.accessToken}`,
      };
    } catch {
      // Invalid stored user
    }
  }
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Get userId from localStorage
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
    const response = await fetch(
      `${API_BASE_URL}/api/subscriptions/status?${params.toString()}`,
      { headers: getAuthHeaders() }
    );

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

    const response = await fetch(`${API_BASE_URL}/api/subscriptions/create-checkout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(requestBody),
    });

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
    const response = await fetch(
      `${API_BASE_URL}/api/subscriptions/cancel?${params.toString()}`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      }
    );

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

    const response = await fetch(`${API_BASE_URL}/api/subscriptions/portal`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, returnUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to create portal session');
    }

    return response.json();
  },
};
