import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useStudioDialogTheme } from "./dialogContext";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./StudioCustomizeDialog";

vi.mock("../StudioModalDiscoverPromptsButton", () => ({
  StudioModalDiscoverPromptsButton: ({
    onApplyPrompt,
  }: {
    onApplyPrompt: (text: string) => void;
  }) => (
    <button type="button" onClick={() => onApplyPrompt("from library")}>
      Discover Prompts
    </button>
  ),
}));

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Clicked {n}
    </button>
  );
}

function Form({
  onApplied = vi.fn(),
  onBack,
}: {
  onApplied?: (t: string) => void;
  onBack?: () => void;
}) {
  return (
    <>
      <StudioCustomizeHeader
        kind="quiz"
        title="Customize Quiz"
        description="Pick options."
        promptLibrary={{ studioTool: "quiz", onApplyPrompt: onApplied }}
        onBack={onBack}
      />
      <StudioCustomizeBody>
        <Counter />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <button type="button">Generate Quiz</button>
      </StudioCustomizeFooter>
    </>
  );
}

type User = ReturnType<typeof userEvent.setup>;

/** Opens the dialog from a button, as the Studio panel's tool grid does (no DialogTrigger). */
function Opener({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(true)}>
        Open quiz
      </button>
      <button type="button">Elsewhere</button>
      <StudioCustomizeDialog open={open} embedded={embedded} onClose={() => setOpen(false)}>
        <Form />
      </StudioCustomizeDialog>
    </div>
  );
}

/** Stands in for Discover / Save as prompt: a nested dialog themed from the Customize dialog. */
function NestedPromptDialog() {
  const theme = useStudioDialogTheme();
  return (
    <Dialog open>
      <DialogContent theme={theme}>
        <DialogTitle>Nested prompt</DialogTitle>
        <DialogDescription>Picks a prompt.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe("StudioCustomizeDialog", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <StudioCustomizeDialog open={false} onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a dialog named by its title and described by its description", () => {
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    const dialog = screen.getByRole("dialog", { name: "Customize Quiz" });
    expect(dialog).toHaveAccessibleDescription("Pick options.");
    expect(within(dialog).getByRole("button", { name: "Generate Quiz" })).toBeInTheDocument();
  });

  it.each([
    ["Close", (user: User) => user.click(screen.getByRole("button", { name: "Close" }))],
    ["Cancel", (user: User) => user.click(screen.getByRole("button", { name: "Cancel" }))],
    ["Escape", (user: User) => user.keyboard("{Escape}")],
  ])("closes from %s", async (_name, act) => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={onClose}>
        <Form />
      </StudioCustomizeDialog>
    );
    await act(user);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    ["modal", false],
    ["embedded", true],
  ])("gives focus back to whatever opened it (%s)", async (_mode, embedded) => {
    const user = userEvent.setup();
    render(<Opener embedded={embedded} />);
    const opener = screen.getByRole("button", { name: "Open quiz" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Customize Quiz" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("leaves focus where the user put it when they click away from an embedded dialog", async () => {
    const user = userEvent.setup();
    render(<Opener embedded />);
    await user.click(screen.getByRole("button", { name: "Open quiz" }));
    await screen.findByRole("dialog", { name: "Customize Quiz" });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    await user.click(elsewhere);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(elsewhere).toHaveFocus();
  });

  it("hands a library prompt to the form", async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form onApplied={onApplied} />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(onApplied).toHaveBeenCalledWith("from library");
  });

  it("shows Back on a second step", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form onBack={onBack} />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("starts the form fresh on every open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Clicked 0" }));
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBeInTheDocument();
    rerender(
      <StudioCustomizeDialog open={false} onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    rerender(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(screen.getByRole("button", { name: "Clicked 0" })).toBeInTheDocument();
  });

  it("renders inside its positioned parent when embedded, with no page overlay", async () => {
    render(
      <div data-testid="mock-frame" className="relative">
        <StudioCustomizeDialog open embedded onClose={vi.fn()}>
          <Form />
        </StudioCustomizeDialog>
      </div>
    );
    const mock = screen.getByTestId("mock-frame");
    const dialog = await within(mock).findByRole("dialog", { name: "Customize Quiz" });
    // The frame's translate makes it the containing block for the content's `position: fixed`.
    const frame = dialog.closest("[data-slot=studio-customize-frame]");
    expect(frame).toHaveClass("absolute", "inset-0", "translate-x-0");
    expect(frame?.parentElement).toBe(mock);
    expect(document.querySelector("[data-slot=dialog-overlay]")).toBeNull();
  });

  it("closes an embedded dialog on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <div className="relative">
        <StudioCustomizeDialog open embedded onClose={onClose}>
          <Form />
        </StudioCustomizeDialog>
      </div>
    );
    await screen.findByRole("dialog", { name: "Customize Quiz" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a closed embedded frame clear of the mock-up's clicks and scrim", () => {
    const { container } = render(
      <div className="relative">
        <StudioCustomizeDialog open={false} embedded onClose={vi.fn()}>
          <Form />
        </StudioCustomizeDialog>
      </div>
    );
    const frame = container.querySelector("[data-slot=studio-customize-frame]");
    expect(frame).toHaveClass("pointer-events-none");
    expect(frame).not.toHaveClass("bg-overlay");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the embedded frame's scrim is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <div className="relative">
        <StudioCustomizeDialog open embedded onClose={onClose}>
          <Form />
        </StudioCustomizeDialog>
      </div>
    );
    const dialog = await screen.findByRole("dialog", { name: "Customize Quiz" });
    const frame = dialog.closest("[data-slot=studio-customize-frame]");
    if (!(frame instanceof HTMLElement)) throw new Error("no embedded frame");
    await user.click(frame);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides the prompt library in previews", () => {
    render(
      <StudioCustomizeDialog open preview onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Quiz" })).toBeInTheDocument();
  });

  it("pins light tokens for the auth page", async () => {
    render(
      <StudioCustomizeDialog open theme="light" onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Customize Quiz" })).toHaveClass("auth-form-light")
    );
  });

  it("passes its theme to a nested prompt dialog", async () => {
    render(
      <StudioCustomizeDialog open theme="light" onClose={vi.fn()}>
        <Form />
        <NestedPromptDialog />
      </StudioCustomizeDialog>
    );
    expect(await screen.findByRole("dialog", { name: "Nested prompt" })).toHaveClass(
      "auth-form-light"
    );
  });

  it("uses the default theme for a nested dialog outside the auth page", async () => {
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
        <NestedPromptDialog />
      </StudioCustomizeDialog>
    );
    expect(await screen.findByRole("dialog", { name: "Nested prompt" })).not.toHaveClass(
      "auth-form-light"
    );
  });

  it("widens the panel for card grids", () => {
    const { rerender } = render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(screen.getByRole("dialog", { name: "Customize Quiz" })).not.toHaveClass("sm:max-w-4xl");
    rerender(
      <StudioCustomizeDialog open wide onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(screen.getByRole("dialog", { name: "Customize Quiz" })).toHaveClass("sm:max-w-4xl");
  });
});
