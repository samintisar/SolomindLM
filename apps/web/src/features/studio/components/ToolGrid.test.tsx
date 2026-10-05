import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS } from "@/shared/constants";
import { ToolGrid } from "./ToolGrid";

const cardOf = (name: string) => screen.getByRole("button", { name }).closest('[data-slot="card"]');

describe("ToolGrid", () => {
  it("calls onToolClick with the tool id", async () => {
    const onToolClick = vi.fn();
    render(<ToolGrid tools={STUDIO_TOOLS} onToolClick={onToolClick} activeToolId="quiz" />);
    await userEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(onToolClick).toHaveBeenCalledWith("reports");
  });

  it("marks only the active tool's card as selected", () => {
    render(<ToolGrid tools={STUDIO_TOOLS} onToolClick={vi.fn()} activeToolId="quiz" />);
    expect(cardOf("Quiz")).toHaveAttribute("data-selected", "true");
    expect(cardOf("Reports")).not.toHaveAttribute("data-selected");
  });

  it("falls back to a default icon for an unknown iconName", () => {
    render(
      <ToolGrid tools={[{ id: "x", label: "Mystery", iconName: "Nope" }]} onToolClick={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Mystery" })).toBeInTheDocument();
  });
});
