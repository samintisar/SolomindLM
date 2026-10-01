import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ResearchPlanMessage } from "./ResearchPlanMessage";

const state = vi.hoisted(() => ({
  plan: undefined as unknown,
  run: null as unknown,
}));

vi.mock("../services/researchApi", () => ({
  useResearchPlan: () => state.plan,
  useLatestRunForPlan: () => state.run,
  useResearchSteps: () => undefined,
}));
vi.mock("../services/literatureReviewApi", () => ({
  useLiteratureTable: (id: string | null) => (id ? { title: "Evidence matrix" } : null),
  useLiteratureReport: (id: string | null) => (id ? { title: "Synthesis report" } : null),
}));

const subQuestions = [
  { id: "q1", question: "What drives X?", searchQueries: [], sourceChannels: ["web", "academic"] },
  { id: "q2", question: "How is Y measured?", searchQueries: [], sourceChannels: [] },
];

function renderPlan(overrides: Partial<React.ComponentProps<typeof ResearchPlanMessage>> = {}) {
  const props = {
    planId: "plan1",
    subQuestions,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onOpenTable: vi.fn(),
    onOpenReport: vi.fn(),
    ...overrides,
  };
  render(<ResearchPlanMessage {...props} />);
  return props;
}

describe("ResearchPlanMessage", () => {
  beforeEach(() => {
    state.plan = { status: "draft", notebookId: "nb1" };
    state.run = null;
  });

  test("lists sub-questions with channel badges", () => {
    renderPlan();
    expect(screen.getByText("What drives X?")).toBeInTheDocument();
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "2 sub-questions")
    ).toBeInTheDocument();
  });

  test("approve calls onApprove with the plan id", async () => {
    const props = renderPlan();
    await userEvent.click(screen.getByRole("button", { name: /Approve & Research/ }));
    expect(props.onApprove).toHaveBeenCalledWith("plan1");
  });

  test("cancel calls onReject with the plan id", async () => {
    const props = renderPlan();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onReject).toHaveBeenCalledWith("plan1");
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  test("shows a loading state until the plan arrives", () => {
    state.plan = undefined;
    renderPlan({ subQuestions: [] });
    expect(screen.getByText("Loading plan…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  test("a finished run offers its artifacts as result cards", async () => {
    state.plan = { status: "approved", notebookId: "nb1" };
    state.run = { _id: "run1", status: "completed", tableId: "t1", reportId: "r1" };
    const props = renderPlan();
    await userEvent.click(screen.getByRole("button", { name: /Evidence matrix/ }));
    expect(props.onOpenTable).toHaveBeenCalledWith("t1");
    await userEvent.click(screen.getByRole("button", { name: /Synthesis report/ }));
    expect(props.onOpenReport).toHaveBeenCalledWith("r1");
  });
});
