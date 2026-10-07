import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeroSection } from "./HeroSection";
import { scrollToSection } from "./scrollToSection";

vi.mock("./scrollToSection", () => ({ scrollToSection: vi.fn() }));

describe("HeroSection", () => {
  it("says the headline once, as the page's h1", () => {
    render(<HeroSection onGetStarted={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "AI that makes you think, not thinks for you."
    );
  });

  it("Start free starts sign-up and How it works scrolls to the features", async () => {
    const onGetStarted = vi.fn();
    render(<HeroSection onGetStarted={onGetStarted} />);
    await userEvent.click(screen.getByRole("button", { name: "Start free" }));
    await userEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(onGetStarted).toHaveBeenCalledOnce();
    expect(scrollToSection).toHaveBeenCalledWith("features");
  });
});
