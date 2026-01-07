export type SubscriptionInterval = 'month' | 'year';
export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'paused';

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  interval: SubscriptionInterval;
  amount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentHistory {
  id: string;
  userId: string;
  subscriptionId: string;
  stripeInvoiceId: string;
  stripePaymentIntentId?: string;
  status: string;
  amount: number;
  currency: string;
  dueDate?: Date;
  paidAt?: Date;
  createdAt: Date;
}

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
}

export interface SubscriptionStatusResponse {
  hasSubscription: boolean;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  interval?: SubscriptionInterval;
  amount?: number;
}

export interface WebhookEvent {
  id: string;
  eventType: string;
  processed: boolean;
  errorMessage?: string;
  createdAt: Date;
  processedAt?: Date;
}
