import { Router, Request, Response } from 'express';
import express from 'express';
import { stripe } from '../config/stripe.js';
import { supabase } from '../config/database.js';
import { env } from '../config/env.js';
import Stripe from 'stripe';

type StripeEvent = Stripe.Event;
type StripeSession = Stripe.Checkout.Session;
type StripeSubscription = Stripe.Subscription;
type StripeInvoice = Stripe.Invoice;

const router = Router();

/**
 * POST /api/webhook/stripe
 * Handle Stripe webhook events
 */
router.post('/stripe',
  // IMPORTANT: Raw body parser for webhook signature verification
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;

    if (!sig) {
      return res.status(400).send('No signature');
    }

    let event: StripeEvent;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      const error = err as Error;
      console.error('[Webhook] Signature verification failed:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    // Check idempotency
    const { data: existingEvent } = await supabase
      .from('stripe_webhook_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();

    if (existingEvent) {
      console.log(`[Webhook] Event ${event.id} already processed`);
      return res.json({ received: true, duplicate: true });
    }

    // Log webhook event
    await supabase.from('stripe_webhook_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
    });

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as StripeSession);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as StripeSubscription);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as StripeSubscription);
          break;
        case 'invoice.paid':
          await handleInvoicePaid(event.data.object as StripeInvoice);
          break;
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object as StripeInvoice);
          break;
        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      await supabase
        .from('stripe_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('stripe_event_id', event.id);

      res.json({ received: true });
    } catch (error) {
      console.error('[Webhook] Error processing event:', error);

      // Mark event as failed
      await supabase
        .from('stripe_webhook_events')
        .update({
          processed: false,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('stripe_event_id', event.id);

      res.status(500).json({ error: 'Failed to process webhook' });
    }
  }
);

// ============================================================
// Event Handlers
// ============================================================

async function handleCheckoutCompleted(session: StripeSession) {
  const userId = session.metadata?.userId;
  if (!userId) {
    throw new Error('No userId in session metadata');
  }

  // Security: Avoid logging user ID to prevent correlation attacks
  console.log(`[Webhook] Checkout completed for session ${session.id}`);
  // Subscription will be created in subscription.updated event
}

async function handleSubscriptionUpdated(subscription: StripeSubscription) {
  const customerId = subscription.customer as string;

  // Get user ID from customer metadata
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !('metadata' in customer)) {
    throw new Error('Invalid customer');
  }
  const userId = customer.metadata.userId;
  if (!userId) {
    throw new Error('No userId in customer metadata');
  }

  // Get price details
  const priceId = subscription.items.data[0].price.id;
  const price = subscription.items.data[0].price;

  // Upsert subscription
  const { data: existing } = await supabase
    .from('stripe_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  const subscriptionData = {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    status: subscription.status,
    current_period_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    interval: subscription.items.data[0].price.recurring?.interval || 'month',
    amount: price.unit_amount || 0,
    currency: price.currency,
    metadata: subscription.metadata,
  };

  let dbError;
  if (existing) {
    const { error } = await supabase
      .from('stripe_subscriptions')
      .update({ ...subscriptionData, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    dbError = error;
  } else {
    const { error } = await supabase
      .from('stripe_subscriptions')
      .insert(subscriptionData);
    dbError = error;
  }

  if (dbError) {
    console.error(`[Webhook] Failed to save subscription:`, dbError);
    throw dbError;
  }

  // Security: Avoid logging user ID to prevent correlation attacks
  console.log(`[Webhook] Subscription ${subscription.id} updated`);
}

async function handleSubscriptionDeleted(subscription: StripeSubscription) {
  const customerId = subscription.customer as string;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !('metadata' in customer)) {
    throw new Error('Invalid customer');
  }
  const userId = customer.metadata.userId;
  if (!userId) {
    throw new Error('No userId in customer metadata');
  }

  await supabase
    .from('stripe_subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);

  // Security: Avoid logging user ID to prevent correlation attacks
  console.log(`[Webhook] Subscription ${subscription.id} deleted`);
}

async function handleInvoicePaid(invoice: StripeInvoice) {
  // Get subscription ID from parent structure (v20+ Basil API)
  let subscriptionId: string | undefined;
  if (invoice.parent?.type === 'subscription_details' && invoice.parent.subscription_details?.subscription) {
    subscriptionId = typeof invoice.parent.subscription_details.subscription === 'string'
      ? invoice.parent.subscription_details.subscription
      : invoice.parent.subscription_details.subscription.id;
  }

  if (!subscriptionId) return;

  const { data: subscription } = await supabase
    .from('stripe_subscriptions')
    .select('id, user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subscription) return;

  // Get payment_intent from the new payments array (v20+ Basil API)
  let paymentIntentId = '';
  if (invoice.payments && 'data' in invoice.payments && invoice.payments.data.length > 0) {
    const invoicePayment = invoice.payments.data[0];
    if (invoicePayment.payment?.payment_intent) {
      paymentIntentId = typeof invoicePayment.payment.payment_intent === 'string'
        ? invoicePayment.payment.payment_intent
        : invoicePayment.payment.payment_intent.id;
    }
  }

  await supabase.from('stripe_payment_history').insert({
    user_id: subscription.user_id,
    subscription_id: subscription.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: paymentIntentId,
    status: invoice.status || 'paid',
    amount: invoice.amount_paid,
    currency: invoice.currency,
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    paid_at: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : new Date().toISOString(),
    metadata: invoice.metadata || {},
  });

  console.log(`[Webhook] Invoice ${invoice.id} paid`);
}

async function handleInvoicePaymentFailed(invoice: StripeInvoice) {
  // Get subscription ID from parent structure (v20+ Basil API)
  let subscriptionId: string | undefined;
  if (invoice.parent?.type === 'subscription_details' && invoice.parent.subscription_details?.subscription) {
    subscriptionId = typeof invoice.parent.subscription_details.subscription === 'string'
      ? invoice.parent.subscription_details.subscription
      : invoice.parent.subscription_details.subscription.id;
  }

  if (!subscriptionId) return;

  await supabase
    .from('stripe_subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);

  console.log(`[Webhook] Invoice ${invoice.id} payment failed`);
}

export default router;
