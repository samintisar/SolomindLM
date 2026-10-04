import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useConfirmDialog } from "./useConfirmDialog";

function Harness({
  onResult,
  variant,
}: {
  onResult: (v: boolean) => void;
  variant?: "danger" | "warning" | "default";
}) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          onResult(
            await confirm("Delete notebook?", "This can't be undone.", {
              confirmText: "Delete",
              variant,
            })
          )
        }
      >
        Open
      </button>
      <ConfirmDialogComponent />
    </>
  );
}

async function open(variant?: "danger" | "warning" | "default") {
  const onResult = vi.fn();
  const user = userEvent.setup();
  render(<Harness onResult={onResult} variant={variant} />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete notebook?" });
  return { onResult, user, dialog };
}

describe("useConfirmDialog", () => {
  it("shows an alert dialog with the title and message", async () => {
    const { dialog } = await open();
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
  });

  it("resolves true on confirm", async () => {
    const { onResult, user } = await open();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("resolves false on cancel", async () => {
    const { onResult, user } = await open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("resolves false on Escape and returns focus to the opener", async () => {
    const { onResult, user } = await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toHaveFocus());
  });

  it("uses the destructive button for danger", async () => {
    await open("danger");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive"
    );
  });

  it("uses the warning button for warning", async () => {
    await open("warning");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "warning"
    );
  });
});
