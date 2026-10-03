import { render, screen, waitFor, within } from "@testing-library/react";
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

import { useGenerateSourceGuide, useGetSignedUrl } from "../services/documentsApi";

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

  test("shows YouTube embed preview below source guide for YouTube sources", () => {
    const mockGenerate = vi.fn();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc-yt",
        title: "ML Lecture",
        type: "YOUTUBE",
        date: "2024-01-15",
        selected: true,
        status: "completed",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        sourceGuide: {
          summary: "Lecture summary.",
          topics: ["Preprocessing"],
          generatedAt: Date.now(),
        },
      },
    });

    const guide = screen.getByRole("button", { name: /source guide/i });
    const preview = screen.getByRole("region", { name: "YouTube video preview" });
    expect(guide.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(preview).toBeInTheDocument();
    expect(screen.getByTitle("ML Lecture")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test("shows unavailable message when YouTube url cannot be embedded", () => {
    const mockGenerate = vi.fn().mockResolvedValue(undefined);
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc-yt-bad",
        title: "Bad Link",
        type: "YOUTUBE",
        date: "2024-01-15",
        selected: true,
        status: "completed",
        url: "https://example.com/not-youtube",
      },
    });

    expect(screen.queryByTestId("youtube-video-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("youtube-embed-unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open video in a new tab" })).toHaveAttribute(
      "href",
      "https://example.com/not-youtube"
    );
  });

  test("shows no YouTube preview when url is missing", () => {
    const mockGenerate = vi.fn().mockResolvedValue(undefined);
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(mockGenerate);

    renderViewer({
      source: {
        id: "doc-yt-no-url",
        title: "No URL",
        type: "YOUTUBE",
        date: "2024-01-15",
        selected: true,
        status: "completed",
      },
    });

    expect(screen.queryByTestId("youtube-video-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("youtube-embed-unavailable")).not.toBeInTheDocument();
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

describe("SourceViewer PDF view switch", () => {
  const pdfSource = {
    id: "doc-pdf",
    title: "Paper",
    type: "PDF" as const,
    date: "2024-01-15",
    selected: true,
    status: "completed" as const,
    sourceGuide: { summary: "Summary.", topics: [], generatedAt: Date.now() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useGenerateSourceGuide as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
  });

  test("switches between the markdown and original PDF views", async () => {
    const user = userEvent.setup();
    (useGetSignedUrl as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue("https://files.test/paper.pdf")
    );
    renderViewer({ source: pdfSource, pdfStorageId: "storage1" });

    const group = screen.getByRole("radiogroup", { name: "Source view" });
    expect(within(group).getByRole("radio", { name: "Markdown" })).toHaveAttribute(
      "data-state",
      "on"
    );

    await user.click(within(group).getByRole("radio", { name: "Original PDF" }));

    expect(within(group).getByRole("radio", { name: "Original PDF" })).toHaveAttribute(
      "data-state",
      "on"
    );
    expect(within(group).getByRole("radio", { name: "Markdown" })).toHaveAttribute(
      "data-state",
      "off"
    );
    expect(await screen.findByTestId("pdf-viewer")).toHaveTextContent(
      "https://files.test/paper.pdf"
    );
  });

  test("shows a visible error and logs when the PDF link can't be fetched", async () => {
    const user = userEvent.setup();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    (useGetSignedUrl as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockRejectedValue(new Error("storage unavailable"))
    );
    renderViewer({ source: pdfSource, pdfStorageId: "storage1" });

    await user.click(screen.getByRole("radio", { name: "Original PDF" }));

    expect(await screen.findByText("Could not load PDF.")).toBeInTheDocument();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
