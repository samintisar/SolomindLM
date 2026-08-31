export type BillingEmailKind =
  | "receipt"
  | "payment_failed"
  | "subscription_canceled"
  | "subscription_started";

export function stripeEventToEmailJobs(eventType: string): BillingEmailKind[] {
  switch (eventType) {
    case "invoice.paid":
      return ["receipt"];
    case "invoice.payment_failed":
      return ["payment_failed"];
    case "customer.subscription.deleted":
      return ["subscription_canceled"];
    case "checkout.session.completed":
      return ["subscription_started"];
    default:
      return [];
  }
}

export function formatInvoiceAmount(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(
      amount / 100
    );
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
}
