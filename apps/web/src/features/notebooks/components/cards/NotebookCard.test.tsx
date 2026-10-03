import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { NotebookItem } from "@/shared/types/index";
import { NotebookCard } from "./NotebookCard";

const nb: NotebookItem = {
  id: "n1",
  title: "Cell Biology",
  date: "Sep 12, 2026",
  sourceCount: 16,
  icon: "Folder",
  created_at: new Date(2026, 8, 12, 12).getTime(),
};

describe("NotebookCard", () => {
  test("opens on click and shows sources", async () => {
    const onSelect = vi.fn();
    render(<NotebookCard notebook={nb} viewMode="grid" onSelectNotebook={onSelect} />);
    expect(screen.getByText(/16 sources/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cell Biology/ }));
    expect(onSelect).toHaveBeenCalledWith(nb);
  });

  test("actions menu is separate from the open button", async () => {
    const onSelect = vi.fn();
    const onCustomize = vi.fn();
    render(
      <NotebookCard
        notebook={nb}
        viewMode="grid"
        onSelectNotebook={onSelect}
        onOpenCustomize={onCustomize}
        onOpenMoveToFolder={vi.fn()}
        onDeleteNotebook={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Notebook actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Customize" }));
    expect(onCustomize).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("featured and shared notebooks have no actions menu", () => {
    const { rerender } = render(
      <NotebookCard notebook={nb} viewMode="grid" onSelectNotebook={vi.fn()} featured />
    );
    expect(screen.queryByRole("button", { name: "Notebook actions" })).toBeNull();
    expect(screen.getByText("Featured")).toBeInTheDocument();
    rerender(
      <NotebookCard
        notebook={{ ...nb, isSharedNotebook: true }}
        viewMode="list"
        onSelectNotebook={vi.fn()}
        onOpenCustomize={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Notebook actions" })).toBeNull();
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  test("list view keeps the Shared badge inside the open button", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isSharedNotebook: true }}
        viewMode="list"
        onSelectNotebook={vi.fn()}
      />
    );
    const open = screen.getByRole("button", { name: /Cell Biology/ });
    expect(within(open).getByText("Shared")).toBeInTheDocument();
  });

  describe("delete", () => {
    const renderCard = (onDelete: (id: string) => void) =>
      render(
        <NotebookCard
          notebook={nb}
          viewMode="grid"
          onSelectNotebook={vi.fn()}
          onDeleteNotebook={onDelete}
        />
      );

    async function chooseDelete() {
      await userEvent.click(screen.getByRole("button", { name: "Notebook actions" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      return screen.findByRole("alertdialog");
    }

    test("confirming deletes the notebook", async () => {
      const onDelete = vi.fn();
      renderCard(onDelete);
      const dialog = await chooseDelete();
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalledWith("n1");
    });

    test("cancelling keeps the notebook", async () => {
      const onDelete = vi.fn();
      renderCard(onDelete);
      const dialog = await chooseDelete();
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
