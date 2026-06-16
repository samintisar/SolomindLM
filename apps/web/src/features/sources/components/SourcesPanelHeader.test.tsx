import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
import type { Source } from "@/shared/types";
import { SourcesPanelHeader } from "./SourcesPanelHeader";

function renderHeader(overrides: Partial<ComponentProps<typeof SourcesPanelHeader>> = {}) {
  const viewingSource: Source = {
    id: "doc-yt",
    title: "ML Lecture",
    type: "YOUTUBE",
    date: "2024-01-15",
    selected: true,
    status: "completed",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };

  const props: ComponentProps<typeof SourcesPanelHeader> = {
    viewingSource,
    onBackToList: vi.fn(),
    onEnterRename: vi.fn(),
    onExitRename: vi.fn(),
    onClose: vi.fn(),
    selectedCount: 1,
    onCopy: vi.fn(),
    onDownload: vi.fn(),
    canCopyOrDownload: true,
    isRenaming: false,
    renameValue: viewingSource.title,
    onRenameChange: vi.fn(),
    onRenameSubmit: vi.fn(),
    onResizeStart: vi.fn(),
    ...overrides,
  };

  return render(<SourcesPanelHeader {...props} />);
}

describe("SourcesPanelHeader external link", () => {
  test("shows external link for YouTube sources on mobile and desktop", () => {
    renderHeader();

    const links = screen.getAllByRole("link", { name: "Open source in new tab" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  test("hides external link when YouTube source has no url", () => {
    renderHeader({
      viewingSource: {
        id: "doc-yt",
        title: "ML Lecture",
        type: "YOUTUBE",
        date: "2024-01-15",
        selected: true,
        status: "completed",
      },
    });

    expect(screen.queryByRole("link", { name: "Open source in new tab" })).not.toBeInTheDocument();
  });
});
