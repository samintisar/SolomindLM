export type SubscriptionInterval = "month" | "year";
type SubscriptionStatus = "active" | "past_due" | "canceled" | "unpaid";

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

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}
