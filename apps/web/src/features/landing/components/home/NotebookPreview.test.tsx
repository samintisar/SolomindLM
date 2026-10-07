import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotebookPreview } from "./NotebookPreview";

describe("NotebookPreview", () => {
  it("is hidden from assistive tech and can't take focus", () => {
    const { container } = render(<NotebookPreview />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveAttribute("inert");
    expect(root.querySelectorAll("button, a, input")).toHaveLength(0);
  });

  it("shows the notebook, the cited passage and the written-question feedback", () => {
    render(<NotebookPreview />);
    expect(screen.getAllByText("Pharmacology · Week 6").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("may precipitate bronchospasm in patients with asthma").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("4 / 5").length).toBeGreaterThan(0);
  });
});
