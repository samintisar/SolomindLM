import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeFlashcardsModal } from "./CustomizeFlashcardsModal";

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

function renderFlashcards(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeFlashcardsModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />
  );
  return { ...utils, onGenerate, onClose };
}

const pick = (group: string, option: string) =>
  userEvent.click(
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option })
  );

describe("CustomizeFlashcardsModal", () => {
  it("generates with the defaults", async () => {
    const { onGenerate } = renderFlashcards();
    expect(screen.getByRole("dialog", { name: "Customize Flashcards" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Cards" }));
    expect(onGenerate).toHaveBeenCalledWith({ count: "standard", difficulty: "medium", topic: "" });
  });

  it("generates with the chosen options and focus", async () => {
    const { onGenerate } = renderFlashcards();
    await pick("Number of cards", "More");
    await pick("Difficulty", "Hard");
    await userEvent.type(screen.getByLabelText("Area of focus"), "Normal forms");
    await userEvent.click(screen.getByRole("button", { name: "Generate Cards" }));
    expect(onGenerate).toHaveBeenCalledWith({
      count: "more",
      difficulty: "hard",
      topic: "Normal forms",
    });
  });

  it("fills the focus from the prompt library", async () => {
    renderFlashcards();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText("Area of focus")).toHaveValue("library prompt for flashcards");
  });

  it("starts from the defaults each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderFlashcards();
    await pick("Difficulty", "Hard");
    rerender(<CustomizeFlashcardsModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />);
    rerender(<CustomizeFlashcardsModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
  });

  it("closes from Close and from Cancel", async () => {
    const { onClose } = renderFlashcards();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps the e2e placeholder on the focus box", () => {
    renderFlashcards();
    expect(screen.getByPlaceholderText(/e\.g\. Focus on 'Relational Algebra'/)).toBeInTheDocument();
  });

  it("Escape in Save as Prompt closes only that dialog", async () => {
    const { onClose } = renderFlashcards();
    await userEvent.type(screen.getByLabelText("Area of focus"), "Exam prep");
    await userEvent.click(screen.getByRole("button", { name: /save as reusable prompt/i }));
    expect(screen.getByRole("dialog", { name: "Save as Prompt" })).toBeInTheDocument();
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Flashcards");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Save as Prompt" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("dialog", { name: "Customize Flashcards" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides the prompt-library actions in previews", async () => {
    const onGenerate = vi.fn();
    render(<CustomizeFlashcardsModal isOpen preview onClose={vi.fn()} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Cards" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});
