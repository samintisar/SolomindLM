import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeInfographicModal } from "./CustomizeInfographicModal";

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

const PROMPT_LABEL = "Describe the infographic you want to create";

const STYLE_NAMES = [
  "Auto-select",
  "Sketch Note",
  "Kawaii",
  "Professional",
  "Scientific",
  "Anime",
  "Clay",
  "Editorial",
  "Instructional",
  "Bento Grid",
  "Bricks",
];

function renderInfographic(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeInfographicModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />
  );
  return { ...utils, onGenerate, onClose };
}

const pick = (group: string, option: string) =>
  userEvent.click(
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option })
  );

describe("CustomizeInfographicModal", () => {
  it("generates with the defaults", async () => {
    const { onGenerate } = renderInfographic();
    expect(screen.getByRole("dialog", { name: "Customize Infographic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto-select" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("radio", { name: "Landscape" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: "Standard" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerate).toHaveBeenCalledWith({
      orientation: "landscape",
      visualStyle: "auto",
      detailLevel: "standard",
      customPrompt: "",
    });
  });

  it("generates with the chosen orientation, detail, style and prompt", async () => {
    const { onGenerate } = renderInfographic();
    await pick("Orientation", "Portrait");
    await pick("Level of detail", "Concise");
    await userEvent.click(screen.getByRole("button", { name: "Clay" }));
    await userEvent.type(screen.getByLabelText(PROMPT_LABEL), "Blue theme");
    expect(screen.getByRole("button", { name: "Clay" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Auto-select" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerate).toHaveBeenCalledWith({
      orientation: "portrait",
      visualStyle: "clay",
      detailLevel: "concise",
      customPrompt: "Blue theme",
    });
  });

  it("offers the square orientation", async () => {
    const { onGenerate } = renderInfographic();
    await pick("Orientation", "Square");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ orientation: "square" }));
  });

  it("offers all eleven styles, each with a decorative thumbnail", () => {
    renderInfographic();
    for (const name of STYLE_NAMES) {
      const card = screen.getByRole("button", { name });
      const thumbnail = card.querySelector("[aria-hidden=true]");
      expect(thumbnail, name).not.toBeNull();
      // A style that falls through to the empty default frame has no preview.
      expect(thumbnail?.childElementCount, name).toBeGreaterThan(0);
    }
  });

  it("has a single button that mentions generate", () => {
    renderInfographic();
    const dialog = screen.getByRole("dialog", { name: "Customize Infographic" });
    expect(within(dialog).getAllByRole("button", { name: /generate/i })).toHaveLength(1);
  });

  it("fills the prompt from the prompt library", async () => {
    renderInfographic();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("library prompt for infographic");
  });

  it("starts from the defaults each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderInfographic();
    await pick("Orientation", "Portrait");
    await userEvent.click(screen.getByRole("button", { name: "Clay" }));
    rerender(
      <CustomizeInfographicModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />
    );
    rerender(<CustomizeInfographicModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("radio", { name: "Landscape" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("button", { name: "Auto-select" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("saves the prompt as an Infographics prompt", async () => {
    renderInfographic();
    await userEvent.type(screen.getByLabelText(PROMPT_LABEL), "Highlight three stats");
    await userEvent.click(screen.getByRole("button", { name: /save as reusable prompt/i }));
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Infographics");
  });

  it("closes from Close and from Cancel", async () => {
    const { onClose } = renderInfographic();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hides the prompt-library actions in previews", async () => {
    const onGenerate = vi.fn();
    render(<CustomizeInfographicModal isOpen preview onClose={vi.fn()} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});
