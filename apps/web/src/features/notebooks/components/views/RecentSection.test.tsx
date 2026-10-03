import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { FolderItem, NotebookItem } from "@/shared/types/index";
import { RecentSection } from "./RecentSection";

const notebook = (id: string, title: string, folderId?: string): NotebookItem => ({
  id,
  title,
  date: "Sep 12, 2026",
  sourceCount: 1,
  icon: "Book",
  created_at: new Date(2026, 8, 12, 12).getTime(),
  folderId,
});

const folder: FolderItem = {
  id: "f1",
  name: "Biology",
  notebookCount: 0,
  created_at: 0,
  updated_at: 0,
};

function renderSection(overrides: Partial<React.ComponentProps<typeof RecentSection>> = {}) {
  return render(
    <RecentSection
      recentNotebooks={[]}
      folders={[]}
      viewMode="grid"
      isLoading={false}
      onCreateNotebook={vi.fn()}
      onSelectNotebook={vi.fn()}
      onSelectFolder={vi.fn()}
      onOpenCustomize={vi.fn()}
      onOpenMoveToFolder={vi.fn()}
      onDeleteNotebook={vi.fn()}
      onOpenFolderCustomize={vi.fn()}
      onDeleteFolder={vi.fn()}
      {...overrides}
    />
  );
}

describe("RecentSection", () => {
  test("shows a loading skeleton while loading", () => {
    renderSection({ isLoading: true });
    expect(screen.getByRole("status", { name: "Loading notebooks" })).toBeInTheDocument();
  });

  test("shows the empty state when there are no folders or notebooks", () => {
    renderSection();
    expect(screen.getByText("Create your first notebook")).toBeInTheDocument();
  });

  test("hides notebooks that live inside a folder", () => {
    renderSection({
      folders: [folder],
      recentNotebooks: [notebook("n1", "Top level"), notebook("n2", "Nested", "f1")],
    });
    expect(screen.getByRole("button", { name: /Top level/ })).toBeInTheDocument();
    expect(screen.queryByText("Nested")).toBeNull();
    expect(screen.getByRole("button", { name: /Biology/ })).toBeInTheDocument();
  });
});
