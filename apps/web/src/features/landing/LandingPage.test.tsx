import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NAV_ITEMS } from "./components/home/landingHomeContent";
import { LandingPage } from "./LandingPage";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({ AuthModal: () => null }));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage onGetStarted={vi.fn()} />
    </MemoryRouter>
  );
}

describe("LandingPage", () => {
  it("has exactly one h1", () => {
    renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders a section for every nav anchor and the footer's /#features and /#pricing links", () => {
    const { container } = renderPage();
    for (const target of [...NAV_ITEMS.map((item) => item.target), "features", "pricing"]) {
      expect(container.querySelector(`section#${target}`)).not.toBeNull();
    }
  });

  it("pins the page to the light theme", () => {
    const { container } = renderPage();
    expect(container.querySelector(".auth-form-light")).not.toBeNull();
  });
});
