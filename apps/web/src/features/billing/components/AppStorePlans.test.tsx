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

  it("offers no purchase while the plan is still loading", () => {
    renderPlans({ hasSubscription: false, source: null, isLoading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading plans");
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore purchases" })).not.toBeInTheDocument();
  });

  it("titles the plans and puts the renewal terms above the cards", () => {
    renderPlans();
    const heading = screen.getByRole("heading", { name: "Pro Yearly" });
    expect(screen.getByRole("heading", { name: "Pro Monthly" })).toBeInTheDocument();
    const terms = screen.getByText(/Payment is charged to your Apple ID/);
    expect(terms.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("disables every button and marks the clicked one busy during a purchase", async () => {
    let finish: (v: { status: string }) => void = () => {};
    purchase.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderPlans();
    const [yearlyButton, monthlyButton] = screen.getAllByRole("button", { name: "Subscribe" });
    fireEvent.click(yearlyButton);
    await waitFor(() => expect(yearlyButton).toHaveAttribute("aria-busy", "true"));
    expect(monthlyButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeDisabled();
    finish({ status: "cancelled" });
    await waitFor(() => expect(monthlyButton).toBeEnabled());
  });

  it("reports purchased, cancelled and error outcomes", async () => {
    renderPlans();
    const subscribe = () => screen.getAllByRole("button", { name: "Subscribe" })[0];

    purchase.mockResolvedValueOnce({ status: "purchased" });
    fireEvent.click(subscribe());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("You're on Pro"));

    purchase.mockResolvedValueOnce({ status: "cancelled" });
    await waitFor(() => expect(subscribe()).toBeEnabled());
    fireEvent.click(subscribe());
    await waitFor(() => expect(purchase).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(subscribe()).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();

    purchase.mockResolvedValueOnce({ status: "error", message: "Card declined" });
    fireEvent.click(subscribe());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Card declined"));

    purchase.mockRejectedValueOnce(new Error("Store unavailable"));
    await waitFor(() => expect(subscribe()).toBeEnabled());
    fireEvent.click(subscribe());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Store unavailable"));
  });
});
