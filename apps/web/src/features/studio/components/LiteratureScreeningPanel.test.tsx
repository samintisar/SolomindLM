import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiteratureScreeningPanel } from "./LiteratureScreeningPanel";

const api = vi.hoisted(() => ({ decisions: undefined as unknown, session: undefined as unknown }));

vi.mock("../services/literatureTablesApi", () => ({
  useLiteratureReviewSession: () => api.session,
  useLiteratureReviewScreeningDecisions: () => api.decisions,
}));

const CRITERIA = [
  { label: "On Topic", description: "Directly studies the question's subject." },
  { label: "Empirical Evidence", description: "Reports an evaluation or experiment." },
];

const INCLUDED = {
  paperIndex: 0,
  rank: 1,
  title: "Attention Is All You Need",
  authors: ["Ashish Vaswani"],
  year: 2017,
  decision: "included",
  reason: "Directly addresses transformer evaluation with empirical analysis.",
  criteria: [
    { label: "On Topic", status: "met", explanation: "Studies transformers directly." },
    { label: "Empirical Evidence", status: "unclear", explanation: "Abstract is vague." },
  ],
};
const EXCLUDED = {
  ...INCLUDED,
  paperIndex: 1,
  rank: 2,
  title: "Cooking with LSTMs",
  decision: "excluded",
  reason: 'Does not meet "On Topic": About recipes.',
  criteria: [
    { label: "On Topic", status: "not_met", explanation: "About recipes." },
    { label: "Empirical Evidence", status: "met", explanation: "Has experiments." },
  ],
};

beforeEach(() => {
  api.decisions = [EXCLUDED, INCLUDED];
  api.session = {
    query: "transformers",
    reviewTitle: "Transformers",
    workflowProvenance: { screeningCriteria: CRITERIA },
  };
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

  it("lists the eligibility criteria the review screened against", () => {
    renderPanel();
    const list = screen.getByRole("list", { name: "Eligibility criteria" });
    expect(within(list).getByText("On Topic")).toBeInTheDocument();
    expect(within(list).getByText("Reports an evaluation or experiment.")).toBeInTheDocument();
  });

  it("expands a row's recorded criterion checks", async () => {
    const user = userEvent.setup();
    renderPanel();
    const [toggle] = screen.getAllByRole("button", { name: "View screening criteria" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Studies transformers directly.")).not.toBeInTheDocument();
    await user.click(toggle);
    const hide = screen.getByRole("button", { name: "Hide screening criteria" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    const controlsId = hide.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const details = document.getElementById(controlsId as string);
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("Studies transformers directly.");
    expect(details?.textContent).toContain("Partly met or unclear: ");
  });

  it("shows only the reason for decisions recorded without criterion checks", () => {
    api.decisions = [{ ...INCLUDED, criteria: undefined }];
    api.session = { query: "transformers", reviewTitle: "Transformers" };
    renderPanel();
    expect(screen.getByText(INCLUDED.reason)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View screening criteria" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Eligibility criteria" })).toBeNull();
  });

  it("exports the decisions, with their criterion checks, as a CSV blob", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((_blob: Blob) => "blob:screening");
    const revokeObjectURL = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      renderPanel();
      await user.click(screen.getByRole("button", { name: "Export" }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0]?.[0];
      expect(blob).toBeInstanceOf(Blob);
      const csv = await (blob as Blob).text();
      expect(csv.split("\n")[0]).toBe("Rank,Title,Authors,Year,Decision,Reason,Criteria");
      expect(csv).toContain("On Topic: not met (About recipes.)");
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      click.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });

  it("shows loading and empty states", () => {
    api.decisions = undefined;
    const { rerender } = renderPanel();
    expect(screen.getByRole("status")).toHaveTextContent("Loading screening decisions…");
    api.decisions = [];
    rerender(<LiteratureScreeningPanel sessionId={"s1" as never} onClose={vi.fn()} />);
    expect(screen.getByText("No screening decisions yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});
