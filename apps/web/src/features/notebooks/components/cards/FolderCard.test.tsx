import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { FolderItem } from "@/shared/types/index";
import { FolderCard } from "./FolderCard";

const folder: FolderItem = {
  id: "f1",
  name: "Biology",
  notebookCount: 6,
  created_at: 0,
  updated_at: 0,
};

describe("FolderCard", () => {
  test.each(["grid", "list"] as const)("%s: opens and reads as a folder", async (viewMode) => {
    const onSelect = vi.fn();
    render(
      <FolderCard
        folder={folder}
        viewMode={viewMode}
        onSelectFolder={onSelect}
        onOpenFolderCustomize={vi.fn()}
        onDeleteFolder={vi.fn()}
      />
    );
    expect(screen.getAllByText("6 notebooks").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Biology/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Folder actions" })).toBeInTheDocument();
  });
});
