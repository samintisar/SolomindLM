import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiteratureScreeningPanel } from "./LiteratureScreeningPanel";

const api = vi.hoisted(() => ({ decisions: undefined as unknown }));

vi.mock("../services/literatureTablesApi", () => ({
  useLiteratureReviewSession: () => ({ query: "transformers", reviewTitle: "Transformers" }),
  useLiteratureReviewScreeningDecisions: () => api.decisions,
}));

const INCLUDED = {
  paperIndex: 0,
  rank: 1,
  title: "Attention Is All You Need",
  authors: ["Ashish Vaswani"],
  year: 2017,
  decision: "included",
  reason: "Directly addresses transformer evaluation with empirical analysis.",
};
const EXCLUDED = {
  ...INCLUDED,
  paperIndex: 1,
  rank: 2,
  title: "Cooking with LSTMs",
  decision: "excluded",
  reason: "Different topic.",
};

beforeEach(() => {
  api.decisions = [EXCLUDED, INCLUDED];
});

function renderPanel() {
  return render(<LiteratureScreeningPanel sessionId={"s1" as never} onClose={vi.fn()} />);
}

describe("LiteratureScreeningPanel", () => {
  it("lists decisions by rank with their outcome", () => {
    renderPanel();
    const titles = screen.getAllByText(/Attention Is All You Need|Cooking with LSTMs/);
    expect(titles.map((t) => t.textContent)).toEqual([
      "Attention Is All You Need",
      "Cooking with LSTMs",
    ]);
    expect(screen.getByText("Papers (2)")).toBeInTheDocument();
    expect(screen.getByText("Included")).toBeInTheDocument();
    expect(screen.getByText("Excluded")).toBeInTheDocument();
  });

  it("expands a row's screening criteria", async () => {
    const user = userEvent.setup();
    renderPanel();
    const [toggle] = screen.getAllByRole("button", { name: "View screening criteria" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide screening criteria" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("shows loading and empty states", () => {
    api.decisions = undefined;
    const { rerender } = renderPanel();
    expect(screen.getByText("Loading screening decisions…")).toBeInTheDocument();
    api.decisions = [];
    rerender(<LiteratureScreeningPanel sessionId={"s1" as never} onClose={vi.fn()} />);
    expect(screen.getByText("No screening decisions yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});
