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

  test("public cards show the author and no owner actions", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        onOpenCustomize={vi.fn()}
        onDeleteNotebook={vi.fn()}
        variant="public"
      />
    );
    expect(screen.getByText(/by Ada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notebook actions" })).not.toBeInTheDocument();
  });

  test("public cards show author and date but no source count", () => {
    const { sourceCount: _omit, ...listing } = nb;
    render(
      <NotebookCard
        notebook={{ ...listing, isPublic: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        variant="public"
      />
    );
    expect(screen.getByText(/^by Ada · Sep 12/)).toBeInTheDocument();
    expect(screen.queryByText(/sources?/)).not.toBeInTheDocument();
  });

  test("featured public cards say Featured", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true, isFeatured: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        variant="public"
      />
    );
    expect(screen.getByText("Featured")).toBeInTheDocument();
  });

  test("your own published notebook shows a Public badge in My notebooks", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        onDeleteNotebook={vi.fn()}
      />
    );
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notebook actions" })).toBeInTheDocument();
  });

  test("admins get moderation actions on public cards", async () => {
    const onToggleFeatured = vi.fn();
    const onSelect = vi.fn();
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={onSelect}
        variant="public"
        adminActions={{ onToggleFeatured, onUnpublish: vi.fn() }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Moderation actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Feature" }));
    expect(onToggleFeatured).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("shared notebooks have no actions menu", () => {
    render(
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
