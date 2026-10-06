import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeSpreadsheetsModal } from "./CustomizeSpreadsheetsModal";

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

const PROMPT_LABEL = "Describe the spreadsheet you want to create";

const BUILT_IN = [
  { title: "Data Table", id: "data_extraction", start: /^Analyze this text and identify/ },
  { title: "Comparison", id: "comparison_table", start: /^Analyze this text to identify/ },
  { title: "Timeline", id: "timeline", start: /^Analyze this text to identify/ },
  { title: "Financial", id: "financial_summary", start: /^Analyze this text to identify/ },
] as const;

function renderSpreadsheets(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeSpreadsheetsModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />
  );
  return {
    ...utils,
    onGenerate,
    onClose,
    dialog: () => screen.getByRole("dialog", { name: "Create spreadsheet" }),
  };
}

describe("CustomizeSpreadsheetsModal", () => {
  it("offers Create Your Own and the four built-in formats as buttons", () => {
    const { dialog } = renderSpreadsheets();
    for (const name of ["Create Your Own", ...BUILT_IN.map((f) => f.title)]) {
      expect(within(dialog()).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("generates Data Table straight from its card, with the cleaned built-in prompt", async () => {
    const { onGenerate } = renderSpreadsheets();
    await userEvent.click(screen.getByText("Data Table", { exact: true }));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ spreadsheetType: "data_extraction" })
    );
    const { customPrompt } = onGenerate.mock.calls[0][0];
    expect(customPrompt).toMatch(/^Analyze this text and identify the distinct \*\*Concepts\*\*/);
    expect(customPrompt).not.toContain("{chunk}");
    expect(customPrompt).not.toContain("CONCEPT EXTRACTION:");
  });

  it("generates every built-in format from its card with its own type and prompt", async () => {
    const { onGenerate } = renderSpreadsheets();
    for (const format of BUILT_IN) {
      await userEvent.click(screen.getByRole("button", { name: format.title }));
      const config = onGenerate.mock.lastCall?.[0];
      expect(config.spreadsheetType).toBe(format.id);
      expect(config.customPrompt).toMatch(format.start);
      expect(config.customPrompt).not.toContain("{chunk}");
    }
    expect(onGenerate).toHaveBeenCalledTimes(BUILT_IN.length);
  });

  it("Create Your Own asks for a prompt, then generates with it", async () => {
    const { onGenerate } = renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    expect(onGenerate).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(PROMPT_LABEL), "My table");
    await userEvent.click(screen.getByRole("button", { name: "Generate Spreadsheet" }));
    expect(onGenerate).toHaveBeenCalledWith({
      spreadsheetType: "custom",
      customPrompt: "My table",
    });
  });

  it("Edit opens a built-in format's prompt, and Back returns to the grid", async () => {
    const { onGenerate } = renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Timeline prompt" }));
    expect(onGenerate).not.toHaveBeenCalled();
    expect((screen.getByLabelText(PROMPT_LABEL) as HTMLTextAreaElement).value).toMatch(
      /^Analyze this text to identify distinct \*\*Time Periods\*\*/
    );
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Data Table" })).toBeInTheDocument();
  });

  it("generates an edited built-in prompt under its own type", async () => {
    const { onGenerate } = renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Financial prompt" }));
    const box = screen.getByLabelText(PROMPT_LABEL);
    await userEvent.clear(box);
    await userEvent.type(box, "Revenue only");
    await userEvent.click(screen.getByRole("button", { name: "Generate Spreadsheet" }));
    expect(onGenerate).toHaveBeenCalledWith({
      spreadsheetType: "financial_summary",
      customPrompt: "Revenue only",
    });
  });

  it("gives every built-in format an Edit button, and Create Your Own none", () => {
    renderSpreadsheets();
    for (const { title } of BUILT_IN) {
      expect(screen.getByRole("button", { name: `Edit the ${title} prompt` })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Edit the Create Your Own prompt" })
    ).not.toBeInTheDocument();
  });

  it("a library prompt applied on the grid opens Create Your Own with it", async () => {
    const { onGenerate } = renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("library prompt for spreadsheet");
    expect(screen.getByText("Create Your Own")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Spreadsheet" }));
    expect(onGenerate).toHaveBeenCalledWith({
      spreadsheetType: "custom",
      customPrompt: "library prompt for spreadsheet",
    });
  });

  it("starts on the format grid each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    rerender(
      <CustomizeSpreadsheetsModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />
    );
    rerender(<CustomizeSpreadsheetsModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.queryByLabelText(PROMPT_LABEL)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data Table" })).toBeInTheDocument();
  });

  it("saves the prompt as a Spreadsheets prompt", async () => {
    renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    await userEvent.type(screen.getByLabelText(PROMPT_LABEL), "My table");
    await userEvent.click(screen.getByRole("button", { name: /save as reusable prompt/i }));
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Spreadsheets");
  });

  it("closes from Close and from Cancel, on both steps", async () => {
    const { onClose } = renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("moves focus to the prompt, and Back returns it to the card that opened it", async () => {
    renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Create Your Own" })).toHaveFocus();
  });

  it("Back returns focus to the Edit button that opened the prompt", async () => {
    renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Timeline prompt" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Edit the Timeline prompt" })).toHaveFocus();
  });

  it("the prompt is described by the chosen format's title", async () => {
    renderSpreadsheets();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Comparison prompt" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveAccessibleDescription("Comparison");
  });

  it("hides the prompt-library actions in previews", async () => {
    render(<CustomizeSpreadsheetsModal isOpen preview onClose={vi.fn()} onGenerate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
  });
});
