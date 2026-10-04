import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeMindMapModal } from "./CustomizeMindMapModal";

// The Discover button opens a Convex-backed library; stub it with a button that applies a prompt.
vi.mock("./StudioModalDiscoverPromptsButton", () => ({
  StudioModalDiscoverPromptsButton: ({
    studioTool,
    onApplyPrompt,
  }: {
    studioTool: string;
    onApplyPrompt: (text: string) => void;
  }) => (
    <button type="button" onClick={() => onApplyPrompt(`library prompt for ${studioTool}`)}>
      Discover Prompts
    </button>
  ),
}));

vi.mock("../services/promptsApi", () => ({
  useCreatePrompt: () => vi.fn(),
  usePublishPrompt: () => vi.fn(),
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function renderModal() {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  render(<CustomizeMindMapModal isOpen onClose={onClose} onGenerate={onGenerate} />);
  return { onGenerate, onClose };
}

describe("CustomizeMindMapModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CustomizeMindMapModal isOpen={false} onClose={vi.fn()} onGenerate={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("generates with the typed custom prompt", async () => {
    const { onGenerate } = renderModal();
    await userEvent.type(screen.getByLabelText("Custom prompt"), "Focus on the cardiac cycle");
    await userEvent.click(screen.getByRole("button", { name: "Generate Mind Map" }));
    expect(onGenerate).toHaveBeenCalledWith({ customPrompt: "Focus on the cardiac cycle" });
  });

  it("generates with an empty prompt when none is given", async () => {
    const { onGenerate } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Generate Mind Map" }));
    expect(onGenerate).toHaveBeenCalledWith({ customPrompt: "" });
  });

  it("applies a prompt from the mind map prompt library", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText("Custom prompt")).toHaveValue("library prompt for mindmap");
  });

  it("only allows saving a prompt once one is typed", async () => {
    renderModal();
    const save = screen.getByRole("button", { name: /save as reusable prompt/i });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Custom prompt"), "x");
    expect(save).toBeEnabled();
  });

  it("closes from the close and cancel buttons", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
