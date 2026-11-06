import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockChannel: "stripe" | "app_store" | "none" = "stripe";
let mockStatus: Record<string, unknown> = { hasSubscription: false };

vi.mock("@/utils/platformDetection", () => ({
  purchaseChannel: () => mockChannel,
  canOfferPurchases: () => mockChannel !== "none",
}));

vi.mock("./AppStorePlans", () => ({
  AppStorePlans: () => <div data-testid="app-store-plans" />,
}));

vi.mock("../services/subscriptionApi", () => ({
  useSubscriptionStatus: () => mockStatus,
  useCreateCheckout: () => vi.fn(),
  useCreatePortalSession: () => vi.fn(),
  useCancelSubscription: () => vi.fn(),
}));

vi.mock("@/shared/ui/useConfirmDialog", () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(), ConfirmDialogComponent: () => null }),
}));

const { BillingPage } = await import("./BillingPage");

const subscriber = {
  hasSubscription: true,
  status: "active",
  interval: "month",
  amount: 1500,
  cancelAtPeriodEnd: false,
};

describe("BillingPage", () => {
  beforeEach(() => {
    mockChannel = "stripe";
    mockStatus = { hasSubscription: false };
  });

  it("offers checkout on the web", () => {
    render(<BillingPage onBack={() => {}} />);

    expect(screen.getAllByRole("button", { name: "Get Started" })).toHaveLength(2);
    expect(screen.getByText("$7.50")).toBeInTheDocument();
  });

  it("shows only the free plan summary in the native app", () => {
    mockChannel = "none";
    render(<BillingPage onBack={() => {}} />);

    expect(screen.getByRole("heading", { name: "Your Plan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free Plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get Started" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("lets a subscriber cancel but not switch plans in the native app", () => {
    mockChannel = "none";
    mockStatus = subscriber;
    render(<BillingPage onBack={() => {}} />);

    expect(screen.getByRole("button", { name: "Cancel Subscription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Free Plan" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("shows App Store plans in a build with in-app purchase", () => {
    mockChannel = "app_store";
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByTestId("app-store-plans")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get Started" })).not.toBeInTheDocument();
  });

  it("on the web, an App Store subscriber sees Apple billing and no Stripe actions", () => {
    mockStatus = { ...subscriber, source: "app_store" };
    render(<BillingPage onBack={() => {}} />);
    expect(
      screen.getByText("Billed by Apple. Manage it in your iPhone's Settings.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Subscription" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Current Price")).not.toBeInTheDocument();
  });

  it("tells an App Store subscriber in grace that Apple couldn't renew", () => {
    mockStatus = {
      ...subscriber,
      source: "app_store",
      status: "past_due",
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    };
    render(<BillingPage onBack={() => {}} />);
    expect(
      screen.getByText(
        "Apple couldn't renew your subscription. Update your payment method in Settings."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
  });

  it("keeps showing the renewal date for a healthy App Store subscription", () => {
    mockStatus = {
      ...subscriber,
      source: "app_store",
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    };
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByText(/Renews on/)).toBeInTheDocument();
  });

  it("shows a Payment issue badge, not a green check, when past due", () => {
    mockStatus = { ...subscriber, status: "past_due" };
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByText("Payment issue")).toBeInTheDocument();
    expect(screen.queryByText(/past_due/)).not.toBeInTheDocument();
  });

  it("in the App Store build, a Stripe subscriber gets no Stripe pricing grid", () => {
    mockChannel = "app_store";
    mockStatus = { ...subscriber, source: "stripe" };
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByTestId("app-store-plans")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
    expect(screen.queryByText("$7.50")).not.toBeInTheDocument();
  });

  it("on the web, a Stripe subscriber still sees the Stripe plan grid", () => {
    mockStatus = { ...subscriber, source: "stripe" };
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByRole("button", { name: "Switch to Yearly" })).toBeInTheDocument();
    expect(screen.queryByTestId("app-store-plans")).not.toBeInTheDocument();
  });
});
