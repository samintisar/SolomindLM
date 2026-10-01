import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings2, Trash2 } from "lucide-react";
import { describe, expect, test, vi } from "vitest";
import { CardActionsMenu } from "./CardActionsMenu";

describe("CardActionsMenu", () => {
  test("opens from a labelled trigger and runs the chosen action", async () => {
    const onCustomize = vi.fn();
    const onDelete = vi.fn();
    render(
      <CardActionsMenu
        label="Notebook actions"
        actions={[
          { label: "Customize", icon: Settings2, onSelect: onCustomize },
          { label: "Delete", icon: Trash2, onSelect: onDelete, destructive: true },
        ]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Notebook actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onCustomize).not.toHaveBeenCalled();
  });
});
