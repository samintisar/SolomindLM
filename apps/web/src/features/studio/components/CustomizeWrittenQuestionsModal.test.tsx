import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeWrittenQuestionsModal } from "./CustomizeWrittenQuestionsModal";

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

function renderWrittenQuestions(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeWrittenQuestionsModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />
  );
  return { ...utils, onGenerate, onClose };
}

const pick = (group: string, option: string) =>
  userEvent.click(
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option })
  );

describe("CustomizeWrittenQuestionsModal", () => {
  it("generates with the defaults", async () => {
    const { onGenerate } = renderWrittenQuestions();
    expect(screen.getByRole("dialog", { name: "Customize Written Questions" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Written Questions" }));
    expect(onGenerate).toHaveBeenCalledWith({
      count: "standard",
      difficulty: "medium",
      questionType: "short",
      focus: "",
    });
  });

  it("generates with the chosen options and focus", async () => {
    const { onGenerate } = renderWrittenQuestions();
    await pick("Number of questions", "Fewer");
    await pick("Question type", "Essay");
    await pick("Difficulty", "Easy");
    await userEvent.type(screen.getByLabelText("Area of focus"), "Normalization");
    await userEvent.click(screen.getByRole("button", { name: "Generate Written Questions" }));
    expect(onGenerate).toHaveBeenCalledWith({
      count: "fewer",
      difficulty: "easy",
      questionType: "essay",
      focus: "Normalization",
    });
  });

  it("fills the focus from the prompt library", async () => {
    renderWrittenQuestions();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText("Area of focus")).toHaveValue(
      "library prompt for writtenQuestions"
    );
  });

  it("starts from the defaults each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderWrittenQuestions();
    await pick("Question type", "Essay");
    rerender(
      <CustomizeWrittenQuestionsModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />
    );
    rerender(<CustomizeWrittenQuestionsModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("radio", { name: "Short" })).toHaveAttribute("aria-checked", "true");
  });

  it("closes from Close and from Cancel", async () => {
    const { onClose } = renderWrittenQuestions();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hides the prompt-library actions in previews", async () => {
    const onGenerate = vi.fn();
    render(
      <CustomizeWrittenQuestionsModal isOpen preview onClose={vi.fn()} onGenerate={onGenerate} />
    );
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Written Questions" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("saves the focus as a Written Questions prompt", async () => {
    renderWrittenQuestions();
    await userEvent.type(screen.getByLabelText("Area of focus"), "Normalization");
    await userEvent.click(screen.getByRole("button", { name: /save as reusable prompt/i }));
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Written Questions");
  });
});
