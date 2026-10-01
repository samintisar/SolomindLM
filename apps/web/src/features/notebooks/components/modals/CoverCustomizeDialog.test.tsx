import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { CoverCustomizeDialog } from "./CoverCustomizeDialog";

describe("CoverCustomizeDialog", () => {
  test("create notebook: no folder icon, saves trimmed name", async () => {
    const onSave = vi.fn();
    render(<CoverCustomizeDialog kind="notebook" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByRole("heading", { name: "Create notebook" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Folder icon" })).toBeNull();
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Notebook title"), "  Physics  ");
    await userEvent.click(screen.getByRole("radio", { name: "Globe icon" }));
    await userEvent.click(create);
    expect(onSave).toHaveBeenCalledWith({
      name: "Physics",
      color: "bg-vintage-brown-300",
      icon: "Globe",
    });
  });

  test("editing a notebook stored with the folder icon shows Book selected", () => {
    render(
      <CoverCustomizeDialog
        kind="notebook"
        initial={{ name: "Old", color: "bg-vintage-blue-300", icon: "Folder" }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Customize notebook" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Book icon" })).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("folders can pick the folder icon", () => {
    render(<CoverCustomizeDialog kind="folder" onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Folder icon" })).toHaveAttribute("data-state", "on");
    expect(screen.getByPlaceholderText("Folder name")).toBeInTheDocument();
  });

  test("Escape and Cancel each call onClose once", async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <CoverCustomizeDialog kind="notebook" onClose={onClose} onSave={vi.fn()} />
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onCancel = vi.fn();
    render(<CoverCustomizeDialog kind="notebook" onClose={onCancel} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("a pending save disables submit so it cannot fire twice", async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    render(<CoverCustomizeDialog kind="notebook" onClose={vi.fn()} onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText("Notebook title"), "Physics");
    const create = screen.getByRole("button", { name: "Create" });
    await userEvent.click(create);
    expect(create).toBeDisabled();
    await userEvent.click(create);
    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave();
    await waitFor(() => expect(create).toBeEnabled());
  });

  test("a failed save re-enables the button", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    render(<CoverCustomizeDialog kind="notebook" onClose={vi.fn()} onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText("Notebook title"), "Physics");
    const create = screen.getByRole("button", { name: "Create" });
    await userEvent.click(create);
    await waitFor(() => expect(create).toBeEnabled());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test("swatches have friendly labels", () => {
    render(<CoverCustomizeDialog kind="notebook" onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Light brown" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Amber" })).toBeInTheDocument();
  });
});
