import type { Doc } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { ConversationList } from "./ConversationList";

const conversations = [
  { _id: "c1", title: "Photosynthesis", updatedAt: 2 },
  { _id: "c2", title: "Cell cycle", updatedAt: 1 },
] as unknown as Doc<"conversations">[];

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

describe("ConversationList", () => {
  test("row menu pins and renames", async () => {
    const props = setup();
    await userEvent.click(screen.getAllByRole("button", { name: /thread actions/i })[1]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));
    expect(props.onTogglePin).toHaveBeenCalledWith("c2");

    await userEvent.click(screen.getAllByRole("button", { name: /thread actions/i })[1]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: /rename/i });
    await userEvent.clear(input);
    await userEvent.type(input, "Mitosis{Enter}");
    expect(props.onRename).toHaveBeenCalledWith("c2", "Mitosis");
  });

  test("selecting a row calls onSelect", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cell cycle" }));
    expect(props.onSelect).toHaveBeenCalledWith("c2");
  });

  test("cancel button cancels a rename instead of saving it", async () => {
    const props = setup();
    await userEvent.click(screen.getAllByRole("button", { name: /thread actions/i })[1]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: /rename/i });
    await userEvent.clear(input);
    await userEvent.type(input, "Changed");
    await userEvent.click(screen.getByRole("button", { name: /cancel rename/i }));
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /rename/i })).toBeNull();
  });

  test("delete asks for confirmation before calling onDelete", async () => {
    const props = setup();
    await userEvent.click(screen.getAllByRole("button", { name: /thread actions/i })[1]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("c2");
  });
});
