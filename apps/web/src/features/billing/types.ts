export type SubscriptionInterval = "month" | "year";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "unpaid";

export interface SubscriptionStatusResponse {
  hasSubscription: boolean;
  status?: SubscriptionStatus;
  plan?: "free" | "premium";
  notebookLimit?: number;
  sourceLimit?: number;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  interval?: SubscriptionInterval;
  amount?: number;
}

export interface CheckoutSessionRequest {
  interval: SubscriptionInterval;
  successUrl: string;
  cancelUrl: string;
  userId?: string; // Optional, sent by client for validation
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}
