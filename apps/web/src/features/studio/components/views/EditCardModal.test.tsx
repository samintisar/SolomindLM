import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditCardModal } from "./EditCardModal";

const onSave = vi.fn();
const onCancel = vi.fn();
const onDelete = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditCardModal", () => {
  it("adds a new card: Save stays disabled until both sides are filled, then trims", async () => {
    const user = userEvent.setup();
    render(<EditCardModal isOpen onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByRole("dialog", { name: "Add New Card" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Add Card" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Front (question)"), "  What is 2+2?  ");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Back (answer)"), " Four ");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSave).toHaveBeenCalledWith({ front: "What is 2+2?", back: "Four" });
  });

  it("prefills an existing card", () => {
    render(
      <EditCardModal
        isOpen
        card={{ front: "Old Q", back: "Old A" }}
        cardIndex={2}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    );
    expect(screen.getByRole("dialog", { name: "Edit Card" })).toBeInTheDocument();
    expect(screen.getByLabelText("Front (question)")).toHaveValue("Old Q");
    expect(screen.getByLabelText("Back (answer)")).toHaveValue("Old A");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("asks before deleting, then calls onDelete", async () => {
    const user = userEvent.setup();
    render(
      <EditCardModal
        isOpen
        card={{ front: "Q", back: "A" }}
        cardIndex={0}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    );
    await user.click(screen.getByRole("button", { name: /Delete Card/ }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog", { name: "Delete this card?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape", async () => {
    const user = userEvent.setup();
    render(<EditCardModal isOpen onSave={onSave} onCancel={onCancel} />);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("starts empty again when reopened without a card", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EditCardModal isOpen onSave={onSave} onCancel={onCancel} />);
    await user.type(screen.getByLabelText("Front (question)"), "draft");
    rerender(<EditCardModal isOpen={false} onSave={onSave} onCancel={onCancel} />);
    rerender(<EditCardModal isOpen onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByLabelText("Front (question)")).toHaveValue("");
  });
});
