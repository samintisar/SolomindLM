import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PricingSection } from "./PricingSection";

describe("PricingSection", () => {
  it("shows annual Pro pricing as the best value by default", () => {
    render(<PricingSection onGetStarted={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Annual" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("$7.50")).toBeInTheDocument();
    // The yearly charge itself is disclosed next to the per-month equivalent.
    expect(screen.getByText("/ month, billed $90 yearly")).toBeInTheDocument();
    expect(screen.getByText("Best value")).toBeInTheDocument();
    expect(screen.getByText("Save 50%")).toBeInTheDocument();
  });

  it("switches Pro to monthly pricing and drops the best-value badge", async () => {
    render(<PricingSection onGetStarted={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    expect(screen.getByText("$15")).toBeInTheDocument();
    expect(screen.queryByText("$7.50")).not.toBeInTheDocument();
    expect(screen.queryByText("Best value")).not.toBeInTheDocument();
  });

  it("both plan buttons start sign-up", async () => {
    const onGetStarted = vi.fn();
    render(<PricingSection onGetStarted={onGetStarted} />);
    await userEvent.click(screen.getByRole("button", { name: "Start free" }));
    await userEvent.click(screen.getByRole("button", { name: "Get Pro" }));
    expect(onGetStarted).toHaveBeenCalledTimes(2);
  });
});
