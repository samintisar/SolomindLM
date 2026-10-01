import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { FolderItem } from "@/shared/types/index";
import { MoveToFolderModal } from "./MoveToFolderModal";

const folders = [
  { id: "f1", name: "Physics", color: "bg-vintage-blue-300", icon: "Folder", notebookCount: 2 },
] as unknown as FolderItem[];

describe("MoveToFolderModal", () => {
  test("No folder moves the notebook out of its folder", async () => {
    const onMove = vi.fn();
    render(
      <MoveToFolderModal notebookId="n1" folders={folders} onClose={vi.fn()} onMove={onMove} />
    );
    await userEvent.click(screen.getByRole("button", { name: /No folder/ }));
    expect(onMove).toHaveBeenCalledWith("n1", null);
  });

  test("clicking a folder moves the notebook into it", async () => {
    const onMove = vi.fn();
    render(
      <MoveToFolderModal notebookId="n1" folders={folders} onClose={vi.fn()} onMove={onMove} />
    );
    await userEvent.click(screen.getByRole("button", { name: /Physics/ }));
    expect(onMove).toHaveBeenCalledWith("n1", "f1");
  });
});
