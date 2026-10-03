import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DeepResearchSourcesSection } from "./DeepResearchSourcesSection";

const mocks = vi.hoisted(() => ({
  evidence: undefined as unknown,
  addSources: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../services/researchApi", () => ({
  useResearchRunEvidence: () => mocks.evidence,
}));
vi.mock("../../sources/services/documentsApi", () => ({
  useAddExternalSources: () => mocks.addSources,
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock("@/shared/components/Favicon", () => ({ Favicon: () => null }));

const evidence = [
  {
    subQuestionId: "q1",
    sourceType: "web",
    sourceTitle: "Mitochondria overview",
    sourceUrl: "https://example.com/mito",
    content: "ATP is made in the mitochondria.",
  },
];

function renderSection() {
  return render(
    <DeepResearchSourcesSection
      researchRunId="run1"
      answerContent="ATP is produced [1]."
      notebookId="nb1"
    />
  );
}

describe("DeepResearchSourcesSection", () => {
  beforeEach(() => {
    mocks.evidence = evidence;
    mocks.addSources.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  test("shows a loading state until evidence arrives", () => {
    mocks.evidence = undefined;
    renderSection();
    expect(screen.getByText("Loading sources…")).toBeInTheDocument();
  });

  test("disclosure reveals sources with status badges", async () => {
    renderSection();
    const trigger = screen.getByRole("button", { name: /sources searched/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Mitochondria overview")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Mitochondria overview")).toBeInTheDocument();
    expect(screen.getByText("Used in answer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute(
      "href",
      "https://example.com/mito"
    );
  });

  test("add to notebook confirms with a toast", async () => {
    mocks.addSources.mockResolvedValue(["doc1"]);
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: /sources searched/i }));
    await userEvent.click(screen.getByRole("button", { name: /add to notebook/i }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Added to sources"));
    expect(mocks.addSources).toHaveBeenCalledOnce();
  });

  test("add to notebook failure reaches the user", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.addSources.mockRejectedValue(new Error("boom"));
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: /sources searched/i }));
    await userEvent.click(screen.getByRole("button", { name: /add to notebook/i }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(mocks.success).not.toHaveBeenCalled();
    // The button is usable again after the failure.
    expect(screen.getByRole("button", { name: /add to notebook/i })).toBeEnabled();
    consoleError.mockRestore();
  });
});
