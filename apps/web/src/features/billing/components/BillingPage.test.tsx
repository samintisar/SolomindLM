import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockIsNativeShell = false;
let mockStatus: Record<string, unknown> = { hasSubscription: false };

vi.mock("@/utils/platformDetection", () => ({
  canOfferPurchases: () => !mockIsNativeShell,
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
    mockIsNativeShell = false;
    mockStatus = { hasSubscription: false };
  });

  it("offers checkout on the web", () => {
    render(<BillingPage onBack={() => {}} />);

    expect(screen.getAllByRole("button", { name: "Get Started" })).toHaveLength(2);
    expect(screen.getByText("$7.50")).toBeInTheDocument();
  });

  it("shows only the free plan summary in the native app", () => {
    mockIsNativeShell = true;
    render(<BillingPage onBack={() => {}} />);

    expect(screen.getByRole("heading", { name: "Your Plan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free Plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get Started" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("lets a subscriber cancel but not switch plans in the native app", () => {
    mockIsNativeShell = true;
    mockStatus = subscriber;
    render(<BillingPage onBack={() => {}} />);

    expect(screen.getByRole("button", { name: "Cancel Subscription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Free Plan" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
