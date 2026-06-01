import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Delete?"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Item"
        message="This cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("shows custom confirm/cancel text", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Proceed?"
        confirmText="Yes, delete"
        cancelText="Go back"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Yes, delete")).toBeInTheDocument();
    expect(screen.getByText("Go back")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Proceed?"
        onCancel={onCancel}
        onConfirm={() => {}}
      />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Proceed?"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
