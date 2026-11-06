// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IapProduct } from "../appStore/iapBridge";

let productsState: { status: string; products?: IapProduct[]; message?: string } = {
  status: "loading",
};
const retry = vi.fn();
const purchase = vi.fn();
const restore = vi.fn();
const manage = vi.fn();
const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };

vi.mock("../appStore/useIapProducts", () => ({
  useIapProducts: () => ({ state: productsState, retry }),
}));
vi.mock("../appStore/iapBridge", () => ({
  purchaseIapProduct: (id: string) => purchase(id),
  restoreIapPurchases: () => restore(),
  openIapSubscriptionManagement: () => manage(),
}));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => toast }));

const { AppStorePlans } = await import("./AppStorePlans");

const PRODUCTS: IapProduct[] = [
  { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2.00", price: 2, period: "month" },
  { id: "com.solomindlm.app.pro.yearly", displayPrice: "$12.00", price: 12, period: "year" },
];

function renderPlans(
  status: ComponentProps<typeof AppStorePlans>["status"] = { hasSubscription: false, source: null }
) {
  return render(
    <MemoryRouter>
      <AppStorePlans status={status} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  productsState = { status: "ready", products: PRODUCTS };
  for (const fn of [retry, purchase, restore, manage, toast.success, toast.info, toast.error]) {
    fn.mockReset();
  }
});

describe("AppStorePlans", () => {
  it("shows Apple's prices, savings, restore and the renewal terms", () => {
    renderPlans();
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.getByText("$12.00")).toBeInTheDocument();
    expect(screen.getByText("Save 50%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeInTheDocument();
    expect(screen.getByText(/Auto-renews until canceled/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });

  it("buys a plan and reports pending approval", async () => {
    purchase.mockResolvedValue({ status: "pending" });
    renderPlans();
    fireEvent.click(screen.getAllByRole("button", { name: "Subscribe" })[0]);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Waiting for approval"));
    expect(purchase).toHaveBeenCalledWith("com.solomindlm.app.pro.yearly");
  });

  it("says so when restore finds nothing", async () => {
    restore.mockResolvedValue(0);
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith("No purchases found for this Apple ID")
    );
  });

  it("offers retry when products fail to load", () => {
    productsState = { status: "error", message: "Plans aren't available right now." };
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });

  it("tells Stripe subscribers their plan is billed on the website, with no buttons", () => {
    renderPlans({ hasSubscription: true, source: "stripe" });
    expect(screen.getByText("Your Pro plan is billed through the website.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks the current App Store plan and offers Manage subscription", () => {
    renderPlans({
      hasSubscription: true,
      source: "app_store",
      appStoreProductId: "com.solomindlm.app.pro.monthly",
    });
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to yearly" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(manage).toHaveBeenCalled();
  });
});
