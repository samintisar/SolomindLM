import { render, screen } from "@testing-library/react";
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
});
