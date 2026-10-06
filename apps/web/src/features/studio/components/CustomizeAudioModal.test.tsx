import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeAudioModal } from "./CustomizeAudioModal";

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

const FOCUS_LABEL = "What should the AI hosts focus on in this episode?";

function renderAudio(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CustomizeAudioModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />
  );
  return { ...utils, onGenerate, onClose };
}

const pick = (group: string, option: string) =>
  userEvent.click(
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option })
  );

describe("CustomizeAudioModal", () => {
  it("generates with the defaults", async () => {
    const { onGenerate } = renderAudio();
    expect(screen.getByRole("dialog", { name: "Customize Audio Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deep Dive" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate Audio" }));
    expect(onGenerate).toHaveBeenCalledWith({
      formatId: "deep_dive",
      length: "default",
      focus: "",
    });
  });

  it("generates with the chosen format, length and focus", async () => {
    const { onGenerate } = renderAudio();
    await userEvent.click(screen.getByRole("button", { name: "Debate" }));
    await pick("Length", "Long");
    await userEvent.type(screen.getByLabelText(FOCUS_LABEL), "Only the second chapter");
    expect(screen.getByRole("button", { name: "Debate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Deep Dive" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate Audio" }));
    expect(onGenerate).toHaveBeenCalledWith({
      formatId: "debate",
      length: "long",
      focus: "Only the second chapter",
    });
  });

  it("offers all four formats", () => {
    renderAudio();
    for (const name of ["Deep Dive", "Brief", "Critique", "Debate"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("fills the focus from the prompt library", async () => {
    renderAudio();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText(FOCUS_LABEL)).toHaveValue("library prompt for audio");
  });

  it("starts from the defaults each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderAudio();
    await pick("Length", "Long");
    rerender(<CustomizeAudioModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />);
    rerender(<CustomizeAudioModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "true");
  });

  it("saves the focus as an Audio prompt", async () => {
    renderAudio();
    await userEvent.type(screen.getByLabelText(FOCUS_LABEL), "Explain to a beginner");
    await userEvent.click(screen.getByRole("button", { name: /save as reusable prompt/i }));
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Audio");
  });

  it("closes from Close and from Cancel", async () => {
    const { onClose } = renderAudio();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hides the prompt-library actions in previews", async () => {
    const onGenerate = vi.fn();
    render(<CustomizeAudioModal isOpen preview onClose={vi.fn()} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as reusable prompt/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Audio" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});
