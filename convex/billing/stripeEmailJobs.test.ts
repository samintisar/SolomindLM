import { describe, expect, it } from "vitest";
import { formatInvoiceAmount, stripeEventToEmailJobs } from "./stripeEmailJobs";

describe("stripeEventToEmailJobs", () => {
  it("maps invoice.payment_failed to dunning instead of the default branch", () => {
    expect(stripeEventToEmailJobs("invoice.payment_failed")).toEqual(["payment_failed"]);
  });

  it("maps known billing events", () => {
    expect(stripeEventToEmailJobs("invoice.paid")).toEqual(["receipt"]);
    expect(stripeEventToEmailJobs("customer.subscription.deleted")).toEqual([
      "subscription_canceled",
    ]);
    expect(stripeEventToEmailJobs("checkout.session.completed")).toEqual(["subscription_started"]);
  });

  it("returns empty for unhandled types", () => {
    expect(stripeEventToEmailJobs("customer.subscription.updated")).toEqual([]);
  });
});

describe("formatInvoiceAmount", () => {
  it("formats cents as currency", () => {
    expect(formatInvoiceAmount(1999, "usd")).toBe("$19.99");
  });
});
