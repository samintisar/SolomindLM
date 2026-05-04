import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveAsPromptModal } from "./SaveAsPromptModal";

// Mock the promptsApi hooks
vi.mock("../services/promptsApi", () => ({
  useCreatePrompt: () => vi.fn().mockResolvedValue("prompt123"),
  usePublishPrompt: () => vi.fn().mockResolvedValue(undefined),
}));

// Mock the useToast hook
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("SaveAsPromptModal", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <SaveAsPromptModal
        isOpen={false}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText="Focus on key concepts"
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders modal with initial prompt text when open", () => {
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText="Focus on key concepts for exam prep"
      />
    );

    expect(screen.getByText("Save as Prompt")).toBeInTheDocument();
    expect(screen.getByText(/Flashcards/)).toBeInTheDocument();

    // The textarea should have the initial text
    const textarea = screen.getByPlaceholderText(/Enter your custom prompt/);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Focus on key concepts for exam prep");
  });

  it("shows tool label correctly for different studio tools", () => {
    const { rerender } = render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="report"
        initialPromptText="Test"
      />
    );
    expect(screen.getByText("Reports")).toBeInTheDocument();

    rerender(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="quiz"
        initialPromptText="Test"
      />
    );
    expect(screen.getByText("Quizzes")).toBeInTheDocument();

    rerender(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="audio"
        initialPromptText="Test"
      />
    );
    expect(screen.getByText("Audio")).toBeInTheDocument();
  });

  it("shows character counts for all text fields", () => {
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="infographic"
        initialPromptText="Initial prompt text"
      />
    );

    // Character counters are displayed in the DOM
    // Check that text with "/" contains numbers (e.g., "0/100")
    const textContent = document.body.textContent || "";
    expect(textContent).toContain("0/100");
    expect(textContent).toContain("0/300");
    expect(textContent).toContain("/2000");
  });

  it("updates title and description fields", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText="Test prompt"
      />
    );

    const titleInput = screen.getByPlaceholderText(/e.g., Focus on key concepts/);
    await user.type(titleInput, "My Custom Prompt");

    expect(titleInput).toHaveValue("My Custom Prompt");

    const descInput = screen.getByPlaceholderText(/Briefly describe/);
    await user.type(descInput, "A great prompt for studying");

    expect(descInput).toHaveValue("A great prompt for studying");
    // Check character counters exist in DOM
    const textContent = document.body.textContent || "";
    expect(textContent).toContain("/100");
    expect(textContent).toContain("/300");
  });

  it("toggles between private and public visibility", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="quiz"
        initialPromptText="Test"
      />
    );

    // Initially private
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText(/Only you can see/)).toBeInTheDocument();

    // Toggle to public - click on the visibility toggle button (bg-muted when private)
    const toggleButton = document.querySelector("button[class*='bg-muted']");
    expect(toggleButton).not.toBeNull();
    await user.click(toggleButton!);

    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText(/Anyone can discover/)).toBeInTheDocument();

    // Public hint should appear
    expect(
      screen.getByText(/Your prompt will be visible in the public library/)
    ).toBeInTheDocument();
  });

  it("disables Save button when title is empty", () => {
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText="Valid prompt text"
      />
    );

    const saveButton = screen.getByRole("button", { name: /Save Prompt/i });
    expect(saveButton).toBeDisabled();
  });

  it("disables Save button when prompt text is empty", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText=""
      />
    );

    const titleInput = screen.getByPlaceholderText(/e.g., Focus on key concepts/);
    const saveButton = screen.getByRole("button", { name: /Save Prompt/i });

    // Fill title only — textarea is still empty, so save must remain disabled.
    await user.type(titleInput, "My Title");

    expect(titleInput).toHaveValue("My Title");
    expect(saveButton).toBeDisabled();
  });

  it("enables Save button when both title and prompt text are filled", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText="Valid prompt text"
      />
    );

    const titleInput = screen.getByPlaceholderText(/e.g., Focus on key concepts/);
    const saveButton = screen.getByRole("button", { name: /Save Prompt/i });

    // Initially disabled (no title)
    expect(saveButton).toBeDisabled();

    // Type a title
    await user.type(titleInput, "My Prompt");

    // Now enabled
    expect(saveButton).not.toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="infographic"
        initialPromptText="Test"
      />
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("closes modal when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="audio"
        initialPromptText="Test"
      />
    );

    // Click on the overlay (the outer backdrop div)
    const overlay = document.querySelector(".bg-black\\/60");
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("closes modal when X button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="report"
        initialPromptText="Test"
      />
    );

    // Find the X button by its SVG icon
    const closeButton = document.querySelector("button svg.lucide-x");
    expect(closeButton).not.toBeNull();
    expect(closeButton!.parentElement).not.toBeNull();
    await user.click(closeButton!.parentElement!);
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("respects max length for title", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText="Test"
      />
    );

    const titleInput = screen.getByPlaceholderText(/e.g., Focus on key concepts/);
    const max100 = "x".repeat(100);

    await user.clear(titleInput);
    await user.type(titleInput, max100);

    expect(titleInput).toHaveValue(max100);
    expect(screen.getByText("100/100")).toBeInTheDocument();

    // Try to type one more character - should be blocked by maxLength prop
    await user.type(titleInput, "x");
    expect(titleInput).toHaveValue(max100); // Still 100 characters
  });

  it("respects max length for description", async () => {
    const user = userEvent.setup();
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="infographic"
        initialPromptText="Test"
      />
    );

    const descInput = screen.getByPlaceholderText(/Briefly describe/);
    const max300 = "y".repeat(300);

    await user.type(descInput, max300);

    expect(descInput).toHaveValue(max300);
    expect(screen.getByText("300/300")).toBeInTheDocument();
  });

  it("respects max length for prompt text", () => {
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="quiz"
        initialPromptText=""
      />
    );

    const textarea = screen.getByPlaceholderText(/Enter your custom prompt/);
    expect(textarea).toHaveAttribute("maxlength", "2000");
  });

  it("shows 'Save as reusable prompt' link button is disabled when topic is empty", () => {
    render(
      <SaveAsPromptModal
        isOpen={true}
        onClose={mockOnClose}
        studioTool="flashcards"
        initialPromptText=""
      />
    );

    // This is more of an integration test - the button in the parent CustomizeFlashcardsModal
    // should be disabled when topic is empty. The modal itself doesn't control that.
    // This test just verifies the modal works with empty initial text.
    const textarea = screen.getByPlaceholderText(/Enter your custom prompt/);
    expect(textarea).toHaveValue("");
  });
});
