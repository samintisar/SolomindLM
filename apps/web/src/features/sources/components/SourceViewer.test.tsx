import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SourceViewer } from "./SourceViewer";

// Mock dependencies
vi.mock("../services/documentsApi", () => ({
  useGetSignedUrl: vi.fn(() => vi.fn()),
  useGenerateSourceGuide: vi.fn(() => vi.fn()),
}));

vi.mock("./PdfViewer", () => ({
  PdfViewer: ({ file }: { file: string }) => <div data-testid="pdf-viewer">{file}</div>,
}));

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-renderer">{children}</div>
  ),
}));

import { useGenerateSourceGuide } from "../services/documentsApi";

function renderViewer(overrides: Partial<ComponentProps<typeof SourceViewer>> = {}) {
  const props: ComponentProps<typeof SourceViewer> = {
    source: {
      id: "doc1",
      title: "Test Source",
      type: "PDF",
      date: "2024-01-15",
      selected: true,
      status: "completed",
    },
    content: "Test content",
    isLoading: false,
    error: undefined,
    ...overrides,
  };
  return { ...render(<SourceViewer {...props} />), props };
}

describe("SourceViewer source guide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("auto-generates source guide on mount when guide is missing", async () => {
    const mockGenerate = vi.fn().mockResolvedValue(undefined);
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "completed",
      },
    });

    // Should show loading state
    expect(screen.getByText("Generating source guide...")).toBeInTheDocument();

    // Should call generate function
    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith("doc1");
    });
  });

  test("displays existing source guide without generating", () => {
    const mockGenerate = vi.fn();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "completed",
        sourceGuide: {
          summary: "A summary about **machine learning**.",
          topics: ["ML", "AI", "Neural Networks"],
          generatedAt: Date.now(),
        },
      },
    });

    // Should show source guide
    expect(screen.getByText("Source guide")).toBeInTheDocument();
    expect(screen.getByTestId("source-guide-summary")).toHaveTextContent(
      "A summary about **machine learning**."
    );

    // Should show topics
    expect(screen.getByText("ML")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Neural Networks")).toBeInTheDocument();

    // Should NOT call generate
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test("requests a chat discussion when a source guide topic is clicked", async () => {
    const user = userEvent.setup();
    const mockGenerate = vi.fn();
    const onDiscussTopic = vi.fn();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      onDiscussTopic,
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "completed",
        sourceGuide: {
          summary: "Summary text.",
          topics: ["Model Training"],
          generatedAt: Date.now(),
        },
      },
    });

    await user.click(screen.getByRole("button", { name: /discuss model training/i }));

    expect(onDiscussTopic).toHaveBeenCalledWith("Model Training");
  });

  test("collapses and expands source guide panel", async () => {
    const user = userEvent.setup();
    const mockGenerate = vi.fn();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "completed",
        sourceGuide: {
          summary: "Summary text.",
          topics: ["Topic A"],
          generatedAt: Date.now(),
        },
      },
    });

    const toggle = screen.getByRole("button", { name: /source guide/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("source-guide-summary")).toBeInTheDocument();
    expect(screen.getByText("Topic A")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("source-guide-summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Topic A")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("source-guide-summary")).toHaveTextContent("Summary text.");
    expect(screen.getByText("Topic A")).toBeInTheDocument();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test("does not generate guide for pending documents", () => {
    const mockGenerate = vi.fn();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "pending",
      },
    });

    // Should not show any guide-related UI
    expect(screen.queryByText("Generating source guide...")).not.toBeInTheDocument();
    expect(screen.queryByText("Source guide")).not.toBeInTheDocument();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test("shows error state when generation fails", async () => {
    const mockGenerate = vi.fn().mockRejectedValue(new Error("LLM service unavailable"));
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "completed",
      },
    });

    await waitFor(() => {
      expect(screen.getByText("LLM service unavailable")).toBeInTheDocument();
    });
  });

  test("only generates once per mount", async () => {
    const mockGenerate = vi.fn().mockResolvedValue(undefined);
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    const { rerender } = renderViewer({
      source: {
        id: "doc1",
        title: "Test Source",
        type: "PDF",
        date: "2024-01-15",
        selected: true,
        status: "completed",
      },
    });

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    // Re-render with same props
    rerender(
      <SourceViewer
        source={{
          id: "doc1",
          title: "Test Source",
          type: "PDF",
          date: "2024-01-15",
          selected: true,
          status: "completed",
        }}
        content="Test content"
        isLoading={false}
        error={undefined}
      />
    );

    // Should still only be called once
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
