import { stripe, STRIPE_PRICES } from '../config/stripe.js';
import { supabase } from '../config/database.js';
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionInterval,
  CheckoutSessionResponse,
  SubscriptionStatusResponse,
} from '../types/subscription.js';

export class SubscriptionService {
  /**
   * Create a Stripe Checkout session for a new subscription
   */
  async createCheckoutSession(
    userId: string,
    interval: SubscriptionInterval,
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionResponse> {
    try {
      // Validate Stripe configuration
      if (!STRIPE_PRICES.PRO_MONTHLY || !STRIPE_PRICES.PRO_YEARLY) {
        throw new Error('Stripe price IDs not configured. Please set STRIPE_PRO_MONTHLY_PRICE_ID and STRIPE_PRO_YEARLY_PRICE_ID environment variables.');
      }

      // Get or create Stripe customer
      const customerId = await this.getOrCreateCustomer(userId);

      // Select price based on interval
      const priceId = interval === 'month'
        ? STRIPE_PRICES.PRO_MONTHLY
        : STRIPE_PRICES.PRO_YEARLY;

      if (!priceId) {
        throw new Error(`Stripe price ID not found for interval: ${interval}`);
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          interval,
        },
        // Customize the checkout page
        custom_text: {
          submit: {
            message: 'By subscribing, you authorize SolomindLM to charge you according to the terms until you cancel.',
          },
        },
        // Add subscription description
        subscription_data: {
          description: interval === 'month' 
            ? 'SolomindLM Pro - Monthly Subscription'
            : 'SolomindLM Pro - Yearly Subscription',
          metadata: {
            userId,
            interval,
          },
        },
        // Allow promotion codes
        allow_promotion_codes: true,
      });

      if (!session.url) {
        throw new Error('Stripe checkout session created but no URL returned');
      }

      return {
        checkoutUrl: session.url,
        sessionId: session.id,
      };
    } catch (error) {
      console.error('[SubscriptionService] createCheckoutSession error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Get or create a Stripe customer for a user
   */
  async getOrCreateCustomer(userId: string): Promise<string> {
    try {
      // Check if user already has a customer ID
      const { data: subscription, error: subError } = await supabase
        .from('stripe_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (subError) {
        console.error('[SubscriptionService] Error querying subscriptions:', subError);
        throw new Error(`Database error: ${subError.message}`);
      }

      if (subscription?.stripe_customer_id) {
        return subscription.stripe_customer_id;
      }

      // Get user email from auth
      const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(userId);
      if (authError) {
        console.error('[SubscriptionService] Error getting user:', authError);
        throw new Error(`Auth error: ${authError.message}`);
      }
      
      if (!user?.email) {
        throw new Error('User email not found');
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId,
        },
      });

      return customer.id;
    } catch (error) {
      console.error('[SubscriptionService] getOrCreateCustomer error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to get or create Stripe customer');
    }
  }

  /**
   * Get subscription status for a user
   */
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResponse> {
    const { data: subscription } = await supabase
      .from('stripe_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return { hasSubscription: false };
    }

    return {
      hasSubscription: true,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      interval: subscription.interval,
      amount: subscription.amount,
    };
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(userId: string): Promise<void> {
    const { data: subscription } = await supabase
      .from('stripe_subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Cancel in Stripe
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  /**
   * Create customer portal session
   */
  async createPortalSession(
    userId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    const { data: subscription } = await supabase
      .from('stripe_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (!subscription?.stripe_customer_id) {
      throw new Error('No Stripe customer found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return { url: session.url };
  }
}

export const subscriptionService = new SubscriptionService();
