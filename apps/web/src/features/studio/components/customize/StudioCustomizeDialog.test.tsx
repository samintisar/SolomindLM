import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
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

  it("closes from Close, Cancel and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={onClose}>
        <Form />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
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
});
