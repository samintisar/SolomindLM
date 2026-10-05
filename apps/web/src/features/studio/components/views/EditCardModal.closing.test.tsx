import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { EditCardModal } from "./EditCardModal";

// Radix unmounts the dialog at once where nothing animates (jsdom), but in a browser it stays
// mounted for the ~200ms fade-out. Keep the content mounted whatever `open` says to reproduce that.
vi.mock("@/shared/components/ui/dialog", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Passthrough,
    DialogContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="dialog">{children}</div>
    ),
    DialogHeader: Passthrough,
    DialogFooter: Passthrough,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  };
});

describe("EditCardModal while closing", () => {
  it("keeps showing the card it was editing after the parent clears it", () => {
    const props = { onSave: vi.fn(), onCancel: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(
      <EditCardModal isOpen card={{ front: "Q", back: "A" }} cardIndex={3} {...props} />
    );
    // The parent clears the card in the same update that closes the dialog.
    rerender(<EditCardModal isOpen={false} card={undefined} cardIndex={undefined} {...props} />);
    expect(screen.getByRole("heading", { name: "Edit Card" })).toBeInTheDocument();
    expect(screen.getByLabelText("Front (question)")).toHaveValue("Q");
    expect(screen.getByLabelText("Back (answer)")).toHaveValue("A");
    expect(screen.getByRole("button", { name: /Delete Card/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("switches to the new card when reopened for another one", () => {
    const props = { onSave: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(
      <EditCardModal isOpen card={{ front: "Q", back: "A" }} cardIndex={3} {...props} />
    );
    rerender(<EditCardModal isOpen={false} card={undefined} cardIndex={undefined} {...props} />);
    rerender(<EditCardModal isOpen card={undefined} cardIndex={undefined} {...props} />);
    expect(screen.getByRole("heading", { name: "Add New Card" })).toBeInTheDocument();
  });
});
