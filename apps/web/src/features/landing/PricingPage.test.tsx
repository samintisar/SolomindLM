import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PLANS } from "./components/home/landingHomeContent";
import { getBillingFaqs } from "./faqRegistry";
import { PricingPage } from "./PricingPage";
import { getPricingRows, PRICING_PAGE } from "./pricingPageContent";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <PricingPage />
    </MemoryRouter>
  );
}

describe("PricingPage", () => {
  it("has one h1 and a Home › Pricing breadcrumb", () => {
    renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(PRICING_PAGE.h1);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(nav).getByText("Pricing")).toHaveAttribute("aria-current", "page");
  });

  it("reuses the home page's plan cards", () => {
    renderPage();
    expect(document.querySelector("section#pricing")).not.toBeNull();
    for (const plan of PLANS) {
      expect(screen.getByRole("heading", { level: 3, name: plan.name })).toBeInTheDocument();
    }
  });

  it("lists every price for both billing periods in one table, as the prerendered page does", () => {
    renderPage();
    const table = screen.getByRole("table", { name: PRICING_PAGE.tableTitle });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(
      getPricingRows().map((row) => `${row.plan}${row.price}${row.billing}`)
    );
  });

  it("answers the billing questions", () => {
    renderPage();
    for (const faq of getBillingFaqs()) {
      expect(screen.getByText(faq.question)).toBeInTheDocument();
    }
  });

  it("opens sign-up from a plan card", async () => {
    renderPage();
    const pro = PLANS.find((plan) => plan.id === "pro");
    await userEvent.click(screen.getByRole("button", { name: pro!.cta }));
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });
});
