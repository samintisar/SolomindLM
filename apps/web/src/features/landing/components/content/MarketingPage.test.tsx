import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPage } from "./MarketingPage";

const nativeShell = vi.hoisted(() => ({ value: false }));

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => nativeShell.value }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/ai-flashcards"]}>
      <Routes>
        <Route
          path="/ai-flashcards"
          element={
            <MarketingPage>
              {(openSignup) => (
                <button type="button" onClick={openSignup}>
                  Try it
                </button>
              )}
            </MarketingPage>
          }
        />
        <Route path="/sign-in" element={<p>signin</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MarketingPage", () => {
  beforeEach(() => {
    nativeShell.value = false;
  });

  it("renders the light-pinned frame: main, closing section and footer", () => {
    const { container } = renderPage();
    expect(container.querySelector(".auth-form-light")).not.toBeNull();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(container.querySelector("#cta-title")).not.toBeNull();
  });

  it("opens the sign-up modal from the render prop's trigger", async () => {
    renderPage();
    expect(screen.queryByRole("dialog", { name: "Sign up" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try it" }));
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });

  it("redirects inside the native shell", () => {
    nativeShell.value = true;
    renderPage();
    expect(screen.getByText("signin")).toBeInTheDocument();
  });
});
