import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingNav } from "./LandingNav";
import { NAV_ITEMS } from "./landingHomeContent";
import { scrollToSection } from "./scrollToSection";

vi.mock("./scrollToSection", () => ({ scrollToSection: vi.fn() }));

function renderNav() {
  const onGetStarted = vi.fn();
  const onLogin = vi.fn();
  render(
    <MemoryRouter>
      <LandingNav onGetStarted={onGetStarted} onLogin={onLogin} />
    </MemoryRouter>
  );
  return { onGetStarted, onLogin };
}

describe("LandingNav", () => {
  beforeEach(() => vi.mocked(scrollToSection).mockClear());

  it("has exactly one Get started button, and it starts sign-up", async () => {
    const { onGetStarted } = renderNav();
    const buttons = screen.getAllByRole("button", { name: /get started/i });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onGetStarted).toHaveBeenCalledOnce();
  });

  it("opens the log-in modal", async () => {
    const { onLogin } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("scrolls to sections from the desktop links", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Features" }));
    await userEvent.click(screen.getByRole("button", { name: "Pricing" }));
    expect(scrollToSection).toHaveBeenNthCalledWith(1, "features");
    expect(scrollToSection).toHaveBeenNthCalledWith(2, "pricing");
  });

  it("opens the phone menu, and its links scroll and close it", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = await screen.findByRole("dialog");
    await userEvent.click(within(menu).getByRole("button", { name: "Use cases" }));
    expect(scrollToSection).toHaveBeenCalledWith("use-cases");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links nav items to home sections when not on the home page", () => {
    render(
      <MemoryRouter initialEntries={["/students/ai-flashcards"]}>
        <LandingNav onGetStarted={vi.fn()} onLogin={vi.fn()} />
      </MemoryRouter>
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const item of NAV_ITEMS) {
      expect(within(nav).getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        `/#${item.target}`
      );
    }
  });
});
