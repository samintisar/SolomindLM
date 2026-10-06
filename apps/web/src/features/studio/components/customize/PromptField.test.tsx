import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import { PromptField } from "./PromptField";
import { StudioCustomizeDialog } from "./StudioCustomizeDialog";

vi.mock("../../services/promptsApi", () => ({
  useCreatePrompt: () => vi.fn(),
  usePublishPrompt: () => vi.fn(),
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function Harness() {
  const [value, setValue] = useState("");
  return (
    <PromptField
      label="Area of focus"
      placeholder="e.g. Focus on normal forms"
      value={value}
      onChange={setValue}
      studioTool="quiz"
    />
  );
}

describe("PromptField", () => {
  it("labels the box and only allows saving once there is text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const save = screen.getByRole("button", { name: /save as reusable prompt/i });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Area of focus"), "Normal forms");
    expect(save).toBeEnabled();
  });

  it("opens Save as Prompt with the text, and returns focus to the button when it closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Area of focus"), "Normal forms");
    const save = screen.getByRole("button", { name: /save as reusable prompt/i });
    await user.click(save);
    expect(screen.getByRole("dialog", { name: "Save as Prompt" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter your custom prompt/)).toHaveValue("Normal forms");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(save).toHaveFocus());
  });

  it("hides Save as reusable prompt in previews", () => {
    render(
      <StudioCustomizeDialog open preview onClose={vi.fn()}>
        <DialogTitle>Preview</DialogTitle>
        <DialogDescription>A marketing mock-up.</DialogDescription>
        <Harness />
      </StudioCustomizeDialog>
    );
    expect(screen.getByLabelText("Area of focus")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
  });
});
