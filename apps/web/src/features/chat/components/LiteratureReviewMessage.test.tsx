import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Message } from "@/shared/types/index";
import { LiteratureReviewMessage } from "./LiteratureReviewMessage";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  retry: vi.fn(),
  session: null as unknown,
  table: null as unknown,
  report: null as unknown,
  toastError: vi.fn(),
  handleLimitError: vi.fn(),
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: mocks.toastError }),
}));

vi.mock("@/shared/hooks/useLimitErrorToast", () => ({
  useLimitErrorToast: () => ({ handleLimitError: mocks.handleLimitError }),
}));

vi.mock("../services/literatureReviewApi", () => ({
  useLiteratureReviewSession: () => mocks.session,
  useLiteratureTable: () => mocks.table,
  useLiteratureReport: () => mocks.report,
  useConfirmLiteratureReviewColumns: () => mocks.confirm,
  useRetryLiteratureReview: () => mocks.retry,
}));
vi.mock("../services/researchApi", () => ({ useResearchSteps: () => undefined }));

type LiteratureReview = NonNullable<Message["literatureReview"]>;

const columns = [
  { id: "c1", name: "Sample size", instructions: "Participants per arm", isVisible: true },
  { id: "c2", name: "Outcome", isVisible: true },
];

function renderMessage(
  literatureReview: Partial<LiteratureReview>,
  handlers: Partial<React.ComponentProps<typeof LiteratureReviewMessage>> = {}
) {
  const message = {
    id: "m1",
    literatureReview: {
      sessionId: "s1",
      query: "q",
      status: "awaiting_columns",
      ...literatureReview,
    },
  } as unknown as Message;
  render(<LiteratureReviewMessage message={message} {...handlers} />);
}

beforeEach(() => {
  mocks.toastError.mockReset();
  mocks.handleLimitError.mockReset().mockResolvedValue({ isLimitError: false });
  mocks.session = null;
  mocks.table = null;
  mocks.report = null;
});

describe("LiteratureReviewMessage failed state", () => {
  beforeEach(() => {
    mocks.retry.mockReset().mockResolvedValue(undefined);
  });

  test("shows the error in an alert and retries from the last step", async () => {
    renderMessage({ status: "failed", error: "Search provider timed out" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Literature Review Failed");
    expect(alert).toHaveTextContent("Search provider timed out");
    await userEvent.click(screen.getByRole("button", { name: "Retry from last step" }));
    expect(mocks.retry).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  test("a failed retry is reported instead of left unhandled", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.retry.mockRejectedValue(new Error("boom"));
    renderMessage({ status: "failed", error: "Search provider timed out" });
    await userEvent.click(screen.getByRole("button", { name: "Retry from last step" }));
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry from last step" })).toBeEnabled();
    consoleError.mockRestore();
  });

  test("a retry refused by a limit shows the limit toast, not a generic one", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const refusal = new Error("This literature review has already been retried 3 times");
    mocks.retry.mockRejectedValue(refusal);
    mocks.handleLimitError.mockResolvedValue({ isLimitError: true });
    renderMessage({ status: "failed", error: "Search provider timed out" });
    await userEvent.click(screen.getByRole("button", { name: "Retry from last step" }));
    expect(mocks.handleLimitError).toHaveBeenCalledWith(refusal);
    expect(mocks.toastError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("falls back to generic copy when there is no error message", () => {
    renderMessage({ status: "failed" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong during the research process."
    );
  });
});

describe("LiteratureReviewMessage column confirmation", () => {
  beforeEach(() => {
    mocks.confirm.mockReset().mockResolvedValue(undefined);
    renderMessage({ suggestedColumns: columns });
  });

  const sentColumns = () => mocks.confirm.mock.calls[0][0].confirmedColumns;

  test("continue sends the suggested columns unchanged", async () => {
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(mocks.confirm).toHaveBeenCalledWith({
      sessionId: "s1",
      confirmedColumns: [
        { id: "c1", name: "Sample size", instructions: "Participants per arm", isVisible: true },
        { id: "c2", name: "Outcome", instructions: undefined, isVisible: true },
      ],
    });
  });

  test("a failed confirm shows a toast and keeps the edited columns", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.confirm.mockRejectedValue(new Error("boom"));
    const input = screen.getByRole("textbox", { name: "Column name 1" });
    await userEvent.clear(input);
    await userEvent.type(input, "N per group");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Column name 1" })).toHaveValue("N per group");
    expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled();
    consoleError.mockRestore();
  });

  test("toggling a column off updates the count and what is sent", async () => {
    await userEvent.click(screen.getByRole("checkbox", { name: "Include Outcome" }));
    expect(screen.getByText(/selected/)).toHaveTextContent("1 of 2 selected");
    expect(screen.getByRole("textbox", { name: "Column name 2" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(sentColumns().map((c: { isVisible: boolean }) => c.isVisible)).toEqual([true, false]);
  });

  test("continue is disabled when nothing is selected", async () => {
    await userEvent.click(screen.getByRole("checkbox", { name: "Include Sample size" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Include Outcome" }));
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  test("renaming a column is sent on continue", async () => {
    const input = screen.getByRole("textbox", { name: "Column name 1" });
    await userEvent.clear(input);
    await userEvent.type(input, "N per group");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(sentColumns()[0].name).toBe("N per group");
  });

  test("removing a column drops it", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Remove Sample size" }));
    expect(screen.queryByRole("textbox", { name: "Column name 2" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(sentColumns().map((c: { id: string }) => c.id)).toEqual(["c2"]);
  });

  test("add column appends a new editable column", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("textbox", { name: "Column name 3" })).toHaveValue("New column");
    expect(screen.getByText(/selected/)).toHaveTextContent("3 of 3 selected");
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(sentColumns()).toHaveLength(3);
    expect(sentColumns()[2].name).toBe("New column");
  });
});

describe("LiteratureReviewMessage completed state", () => {
  test("offers the table and report as result cards", async () => {
    mocks.session = { notebookId: "nb1", status: "completed", tableId: "t1", reportId: "r1" };
    mocks.table = {
      title: "Lit table",
      papers: [{ isIncluded: true }],
      columns: [{ isVisible: true }],
    };
    mocks.report = { title: "Lit report", content: "" };
    const onOpenTable = vi.fn();
    const onOpenReport = vi.fn();
    renderMessage({ status: "completed" }, { onOpenTable, onOpenReport });
    await userEvent.click(screen.getByRole("button", { name: /Lit table/ }));
    expect(onOpenTable).toHaveBeenCalledWith("t1");
    await userEvent.click(screen.getByRole("button", { name: /Lit report/ }));
    expect(onOpenReport).toHaveBeenCalledWith("r1");
  });
});

describe("LiteratureReviewMessage with notebook papers", () => {
  test("the column card says which of the user's papers are included", () => {
    mocks.session = {
      notebookId: "nb1",
      status: "awaiting_columns",
      documentIds: ["d1", "d2"],
      paperScope: "papers_only",
    };
    renderMessage({ suggestedColumns: columns });
    expect(screen.getByText("Papers: Only your 2 papers")).toBeInTheDocument();
  });

  test("the completion message splits the user's papers from search results", () => {
    mocks.session = { notebookId: "nb1", status: "completed", tableId: "t1" };
    mocks.table = {
      title: "Lit table",
      papers: [
        { isIncluded: true, citation: { sourceApi: "notebook" } },
        { isIncluded: true, citation: { sourceApi: "notebook" } },
        { isIncluded: true, citation: { sourceApi: "pubmed" } },
      ],
      columns: [{ isVisible: true }],
    };
    renderMessage({ status: "completed" });
    expect(screen.getByText("2 of your papers + 1 from search")).toBeInTheDocument();
  });
});
