import type { Doc } from "@convex/_generated/dataModel";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { toast as sonner } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { ConversationList } from "./ConversationList";

const conversations = [
  { _id: "c1", title: "Photosynthesis", updatedAt: 2 },
  { _id: "c2", title: "Cell cycle", updatedAt: 1 },
] as unknown as Doc<"conversations">[];

const CELL_CYCLE_ACTIONS = { name: "Thread actions for Cell cycle" };

function setup(over: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
  const props = {
    conversations,
    activeConversationId: "c1",
    onSelect: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    pinnedIds: new Set<string>(),
    onTogglePin: vi.fn(),
    ...over,
  };
  render(
    <ToastProvider>
      <ConversationList {...props} />
    </ToastProvider>
  );
  return props;
}

async function startRename() {
  await userEvent.click(screen.getByRole("button", CELL_CYCLE_ACTIONS));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
  return screen.getByRole("textbox", { name: /rename/i });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConversationList", () => {
  test("row menu pins and renames", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", CELL_CYCLE_ACTIONS));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));
    expect(props.onTogglePin).toHaveBeenCalledWith("c2");

    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "Mitosis{Enter}");
    expect(props.onRename).toHaveBeenCalledWith("c2", "Mitosis");
  });

  test("selecting a row calls onSelect and marks the active row", async () => {
    const props = setup();
    expect(screen.getByRole("button", { name: "Photosynthesis" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("button", { name: "Cell cycle" })).not.toHaveAttribute("aria-current");
    await userEvent.click(screen.getByRole("button", { name: "Cell cycle" }));
    expect(props.onSelect).toHaveBeenCalledWith("c2");
  });

  test("shows Unpin for a pinned thread", async () => {
    setup({ pinnedIds: new Set(["c2"]) });
    await userEvent.click(screen.getByRole("button", CELL_CYCLE_ACTIONS));
    expect(await screen.findByRole("menuitem", { name: "Unpin" })).toBeInTheDocument();
  });

  test("Enter saves exactly once", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "Mitosis{Enter}");
    expect(props.onRename).toHaveBeenCalledTimes(1);
  });

  test("blur saves", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "Mitosis");
    await userEvent.click(document.body);
    expect(props.onRename).toHaveBeenCalledTimes(1);
    expect(props.onRename).toHaveBeenCalledWith("c2", "Mitosis");
  });

  test("Escape cancels without saving", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.type(input, " edited{Escape}");
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /rename/i })).toBeNull();
  });

  test("empty or whitespace title does not rename", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /rename/i })).toBeNull();
  });

  test("cancel button cancels a rename instead of saving it", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "Changed");
    await userEvent.click(screen.getByRole("button", { name: /cancel rename/i }));
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /rename/i })).toBeNull();
  });

  test("tabbing to Cancel and pressing Enter does not rename", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.type(input, " edited");
    await userEvent.tab(); // Save name
    await userEvent.tab(); // Cancel rename
    expect(screen.getByRole("button", { name: /cancel rename/i })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /rename/i })).toBeNull();
  });

  test("tabbing to Save and pressing Enter saves", async () => {
    const props = setup();
    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "Mitosis");
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(props.onRename).toHaveBeenCalledTimes(1);
    expect(props.onRename).toHaveBeenCalledWith("c2", "Mitosis");
  });

  test("a rejected rename shows an error toast", async () => {
    const error = vi.spyOn(sonner, "error").mockImplementation(() => "");
    setup({ onRename: vi.fn().mockRejectedValue(new Error("nope")) });
    const input = await startRename();
    await userEvent.clear(input);
    await userEvent.type(input, "Mitosis{Enter}");
    expect(error).toHaveBeenCalledWith("Failed to rename thread", expect.anything());
  });

  async function openDeleteConfirm() {
    await userEvent.click(screen.getByRole("button", CELL_CYCLE_ACTIONS));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    return screen.findByRole("alertdialog", { name: "Delete thread?" });
  }

  test("delete asks for confirmation before calling onDelete", async () => {
    const props = setup();
    const alert = await openDeleteConfirm();
    expect(alert).toHaveTextContent(
      "This will permanently delete this thread and all its messages."
    );
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("c2");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  test("cancelling the delete confirm does not call onDelete", async () => {
    const props = setup();
    const alert = await openDeleteConfirm();
    await userEvent.click(within(alert).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  test("Escape closes the delete confirm without deleting", async () => {
    const props = setup();
    await openDeleteConfirm();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  test("a rejected delete shows an error toast", async () => {
    const error = vi.spyOn(sonner, "error").mockImplementation(() => "");
    setup({ onDelete: vi.fn().mockRejectedValue(new Error("nope")) });
    const alert = await openDeleteConfirm();
    await userEvent.click(within(alert).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Failed to delete thread", expect.anything())
    );
  });
});
