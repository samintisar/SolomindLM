import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeQuizModal } from "./CustomizeQuizModal";

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

function renderQuiz(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeQuizModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />
  );
  return { ...utils, onGenerate, onClose };
}

const pick = (group: string, option: string) =>
  userEvent.click(
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option })
  );

describe("CustomizeQuizModal", () => {
  it("generates with the defaults", async () => {
    const { onGenerate } = renderQuiz();
    expect(screen.getByRole("dialog", { name: "Customize Quiz" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
    expect(onGenerate).toHaveBeenCalledWith({ count: "standard", difficulty: "medium", focus: "" });
  });

  it("generates with the chosen options and focus", async () => {
    const { onGenerate } = renderQuiz();
    await pick("Number of questions", "More");
    await pick("Difficulty", "Hard");
    await userEvent.type(screen.getByLabelText("Area of focus"), "Normal forms");
    await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
    expect(onGenerate).toHaveBeenCalledWith({
      count: "more",
      difficulty: "hard",
      focus: "Normal forms",
    });
  });

  it("fills the focus from the prompt library", async () => {
    renderQuiz();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText("Area of focus")).toHaveValue("library prompt for quiz");
  });

  it("starts from the defaults each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderQuiz();
    await pick("Difficulty", "Hard");
    rerender(<CustomizeQuizModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />);
    rerender(<CustomizeQuizModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
  });

  it("closes from Close and from Cancel", async () => {
    const { onClose } = renderQuiz();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hides the prompt-library actions in previews", async () => {
    const onGenerate = vi.fn();
    render(<CustomizeQuizModal isOpen preview onClose={vi.fn()} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});
