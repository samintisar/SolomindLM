import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioTool } from "../services/promptsApi";
import { SaveAsPromptModal } from "./SaveAsPromptModal";

const api = vi.hoisted(() => ({
  createPrompt: vi.fn(),
  publishPrompt: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../services/promptsApi", () => ({
  useCreatePrompt: () => api.createPrompt,
  usePublishPrompt: () => api.publishPrompt,
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: api.success, error: api.error }),
}));

const onClose = vi.fn();

function renderOpen(
  initialPromptText = "Focus on key concepts",
  studioTool: StudioTool = "flashcards"
) {
  return render(
    <SaveAsPromptModal
      isOpen
      onClose={onClose}
      studioTool={studioTool}
      initialPromptText={initialPromptText}
    />
  );
}

const titleInput = () => screen.getByPlaceholderText(/e.g., Focus on key concepts/);
const promptBox = () => screen.getByPlaceholderText(/Enter your custom prompt/);
const saveButton = () => screen.getByRole("button", { name: /Save Prompt/i });

beforeEach(() => {
  vi.clearAllMocks();
  api.createPrompt.mockResolvedValue("prompt123");
  api.publishPrompt.mockResolvedValue(undefined);
});

describe("SaveAsPromptModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SaveAsPromptModal
        isOpen={false}
        onClose={onClose}
        studioTool="flashcards"
        initialPromptText="x"
      />
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens prefilled with the Customize dialog's text and its tool", () => {
    renderOpen("Focus on key concepts for exam prep");
    expect(screen.getByRole("dialog", { name: "Save as Prompt" })).toBeInTheDocument();
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Flashcards");
    expect(promptBox()).toHaveValue("Focus on key concepts for exam prep");
  });

  it("labels each studio tool", () => {
    const { rerender } = renderOpen("Test", "report");
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Reports");
    rerender(
      <SaveAsPromptModal isOpen onClose={onClose} studioTool="quiz" initialPromptText="Test" />
    );
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Quizzes");
    rerender(
      <SaveAsPromptModal isOpen onClose={onClose} studioTool="audio" initialPromptText="Test" />
    );
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Audio");
  });

  it("lets the prompt text be edited", async () => {
    const user = userEvent.setup();
    renderOpen("Start");
    await user.type(promptBox(), " and more");
    expect(promptBox()).toHaveValue("Start and more");
  });

  it("starts fresh when it is closed and opened again with new text", async () => {
    const user = userEvent.setup();
    const props = { onClose, studioTool: "flashcards" as const };
    const { rerender } = render(<SaveAsPromptModal {...props} isOpen initialPromptText="First" />);
    await user.type(titleInput(), "Draft title");
    await user.type(promptBox(), " edited");
    rerender(<SaveAsPromptModal {...props} isOpen={false} initialPromptText="First" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<SaveAsPromptModal {...props} isOpen initialPromptText="Second" />);
    expect(promptBox()).toHaveValue("Second");
    expect(titleInput()).toHaveValue("");
  });

  it("shows an error and stays open when saving fails", async () => {
    const user = userEvent.setup();
    api.createPrompt.mockRejectedValue(new Error("Network down"));
    renderOpen("Prompt body");
    await user.type(titleInput(), "My prompt");
    await user.click(saveButton());
    expect(api.error).toHaveBeenCalledWith("Network down");
    expect(api.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();
    expect(titleInput()).toHaveValue("My prompt");
  });

  it("shows character counts", () => {
    renderOpen("Initial prompt text");
    expect(screen.getByText("0/100")).toBeInTheDocument();
    expect(screen.getByText("0/300")).toBeInTheDocument();
    expect(screen.getByText("19/2000")).toBeInTheDocument();
  });

  it("keeps Save disabled until there is a title and a prompt", async () => {
    const user = userEvent.setup();
    renderOpen("Valid prompt text");
    expect(saveButton()).toBeDisabled();
    await user.type(titleInput(), "My Prompt");
    expect(saveButton()).toBeEnabled();
  });

  it("keeps Save disabled when the prompt text is empty", async () => {
    const user = userEvent.setup();
    renderOpen("");
    await user.type(titleInput(), "My Title");
    expect(saveButton()).toBeDisabled();
  });

  it("switches between private and public", async () => {
    const user = userEvent.setup();
    renderOpen("Test");
    const toggle = screen.getByTestId("save-as-prompt-visibility-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Only you can see and use this prompt/)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Anyone can discover and use this prompt/)).toBeInTheDocument();
    expect(
      screen.getByText(/Your prompt will be visible in the public library/)
    ).toBeInTheDocument();
  });

  it("saves a private prompt with trimmed fields, then closes", async () => {
    const user = userEvent.setup();
    renderOpen("  Prompt body  ");
    await user.type(titleInput(), "  My prompt  ");
    await user.click(saveButton());
    expect(api.createPrompt).toHaveBeenCalledWith({
      title: "My prompt",
      description: undefined,
      promptText: "Prompt body",
      studioTool: "flashcards",
      notebookId: undefined,
    });
    expect(api.publishPrompt).not.toHaveBeenCalled();
    expect(api.success).toHaveBeenCalledWith("Prompt saved to your library!");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("publishes the saved prompt when shared publicly", async () => {
    const user = userEvent.setup();
    renderOpen("Prompt body");
    await user.type(titleInput(), "Shared");
    await user.click(screen.getByTestId("save-as-prompt-visibility-toggle"));
    await user.click(saveButton());
    expect(api.publishPrompt).toHaveBeenCalledWith("prompt123");
    expect(api.success).toHaveBeenCalledWith("Prompt saved and published to the library!");
  });

  it("closes from Cancel, the close button and Escape", async () => {
    const user = userEvent.setup();
    renderOpen("Test");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByTestId("save-as-prompt-close"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("caps the title, description and prompt lengths", async () => {
    const user = userEvent.setup();
    renderOpen("Test");
    await user.type(titleInput(), "x".repeat(101));
    expect(titleInput()).toHaveValue("x".repeat(100));
    expect(screen.getByText("100/100")).toBeInTheDocument();
    const description = screen.getByPlaceholderText(/Briefly describe/);
    fireEvent.change(description, { target: { value: "y".repeat(300) } });
    expect(screen.getByText("300/300")).toBeInTheDocument();
    expect(promptBox()).toHaveAttribute("maxlength", "2000");
  });
});
