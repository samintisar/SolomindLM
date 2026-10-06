import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeReportModal } from "./CustomizeReportModal";

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

const PROMPT_LABEL = "Describe the report you want to create";

const FORMAT_TITLES = [
  "Create Your Own",
  "Briefing Doc",
  "Study Guide",
  "Blog Post",
  "Summary",
  "Technical Report",
  "Concept Explainer",
  "Methodology Overview",
];

function renderReport(isOpen = true) {
  const onSelectFormat = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeReportModal isOpen={isOpen} onClose={onClose} onSelectFormat={onSelectFormat} />
  );
  return {
    ...utils,
    onSelectFormat,
    onClose,
    dialog: () => screen.getByRole("dialog", { name: "Create report" }),
  };
}

describe("CustomizeReportModal", () => {
  it("offers all eight formats as buttons", () => {
    const { dialog } = renderReport();
    for (const name of FORMAT_TITLES) {
      expect(within(dialog()).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("generates a built-in format straight from its card", async () => {
    const { onSelectFormat, dialog } = renderReport();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Summary" }));
    expect(onSelectFormat).toHaveBeenCalledWith("summary");
  });

  it("Create Your Own asks for a prompt, then generates with it", async () => {
    const { onSelectFormat, dialog } = renderReport();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Create Your Own" }));
    expect(onSelectFormat).not.toHaveBeenCalled();
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("");
    await userEvent.type(screen.getByLabelText(PROMPT_LABEL), "A timeline");
    await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    expect(onSelectFormat).toHaveBeenCalledWith("custom", "A timeline");
  });

  it("gives every built-in format an Edit button, and Create Your Own none", () => {
    renderReport();
    for (const name of FORMAT_TITLES.slice(1)) {
      expect(screen.getByRole("button", { name: `Edit the ${name} prompt` })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Edit the Create Your Own prompt" })
    ).not.toBeInTheDocument();
  });

  it("Edit opens a built-in format's prompt, and Back returns to the grid", async () => {
    const { onSelectFormat } = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Briefing Doc prompt" }));
    expect(onSelectFormat).not.toHaveBeenCalled();
    expect((screen.getByLabelText(PROMPT_LABEL) as HTMLTextAreaElement).value).toMatch(
      /^Create a comprehensive briefing document/
    );
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument();
  });

  it("generates an edited built-in prompt under its own format", async () => {
    const { onSelectFormat } = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Study Guide prompt" }));
    const box = screen.getByLabelText(PROMPT_LABEL);
    await userEvent.clear(box);
    await userEvent.type(box, "Only a glossary");
    await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    expect(onSelectFormat).toHaveBeenCalledWith("study_guide", "Only a glossary");
  });

  it("a library prompt applied on the grid opens Create Your Own with it", async () => {
    const { onSelectFormat } = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("library prompt for report");
    expect(screen.getByText("Create Your Own")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    expect(onSelectFormat).toHaveBeenCalledWith("custom", "library prompt for report");
  });

  it("a library prompt applied on the prompt step keeps the chosen format", async () => {
    const { onSelectFormat } = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Blog Post prompt" }));
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("library prompt for report");
    await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    expect(onSelectFormat).toHaveBeenCalledWith("blog_post", "library prompt for report");
  });

  it("starts on the format grid each time it opens", async () => {
    const { rerender, onClose, onSelectFormat } = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toBeInTheDocument();
    rerender(
      <CustomizeReportModal isOpen={false} onClose={onClose} onSelectFormat={onSelectFormat} />
    );
    rerender(<CustomizeReportModal isOpen onClose={onClose} onSelectFormat={onSelectFormat} />);
    expect(screen.queryByLabelText(PROMPT_LABEL)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument();
  });

  it("saves the prompt as a Reports prompt", async () => {
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    const save = screen.getByRole("button", { name: /save as reusable prompt/i });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText(PROMPT_LABEL), "A timeline");
    await userEvent.click(save);
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Reports");
  });

  it("closes from Close and from Cancel, on both steps", async () => {
    const { onClose } = renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("moves focus to the prompt, and Back returns it to the card that opened it", async () => {
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Create Your Own" })).toHaveFocus();
  });

  it("Back returns focus to the Edit button that opened the prompt", async () => {
    renderReport();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit the Concept Explainer prompt" })
    );
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Edit the Concept Explainer prompt" })).toHaveFocus();
  });

  it("Back after a library prompt returns focus to Create Your Own", async () => {
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(screen.getByRole("button", { name: "Create Your Own" })).toHaveFocus();
  });

  it("the prompt is described by the chosen format's title", async () => {
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Edit the Technical Report prompt" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveAccessibleDescription("Technical Report");
  });

  it("hides the prompt-library actions in previews", async () => {
    const onSelectFormat = vi.fn();
    render(
      <CustomizeReportModal isOpen preview onClose={vi.fn()} onSelectFormat={onSelectFormat} />
    );
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));
    expect(onSelectFormat).toHaveBeenCalledWith("custom", "");
  });
});
