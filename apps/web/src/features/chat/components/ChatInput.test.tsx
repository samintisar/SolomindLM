import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AVAILABLE_SMART_MODELS } from "@/shared/constants/models";
import type { ChatVoiceState } from "../hooks/useChatVoiceTranscription";
import { ChatInput } from "./ChatInput";

const voice = vi.hoisted(() => ({
  state: { voiceState: "idle" as ChatVoiceState, formatElapsed: "0:00" },
  toggleRecording: vi.fn(async () => {}),
}));

vi.mock("../hooks/useChatVoiceTranscription", () => ({
  useChatVoiceTranscription: () => ({ ...voice.state, toggleRecording: voice.toggleRecording }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  voice.state = { voiceState: "idle", formatElapsed: "0:00" };
  voice.toggleRecording.mockClear();
});

type Props = ComponentProps<typeof ChatInput>;

/** A ChatInput with test defaults; `props` override them. */
function chatInput(props: Partial<Props> = {}) {
  return (
    <ChatInput
      value="Hello"
      onChange={vi.fn()}
      onSend={vi.fn()}
      notebookId="nb1"
      mode="chat"
      onModeChange={vi.fn()}
      researchDatabase="all"
      onResearchDatabaseChange={vi.fn()}
      onSourceFilterChange={vi.fn()}
      {...props}
    />
  );
}

function renderInput(props: Partial<Props> = {}) {
  const onSend = vi.fn();
  const utils = render(chatInput({ onSend, ...props }));
  return { ...utils, onSend, textarea: screen.getByRole("textbox") };
}

const modeTrigger = () => screen.queryByRole("button", { name: /^Composer mode:/ });
const dbTrigger = () => screen.queryByRole("button", { name: /^Research databases/ });
const filtersTrigger = () => screen.queryByRole("button", { name: "Filters" });
const modelTrigger = () => screen.queryByRole("button", { name: /^Model:/ });
const voiceTrigger = () => screen.queryByRole("button", { name: "Voice input" });

describe("ChatInput keyboard", () => {
  test("Enter sends; Shift+Enter and IME composition don't", () => {
    const { onSend, textarea } = renderInput();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });
    fireEvent.keyDown(textarea, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  test("Shift+Enter is left to the textarea (newline)", () => {
    const { textarea } = renderInput();
    const shift = fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(shift).toBe(true); // not default-prevented
    const plain = fireEvent.keyDown(textarea, { key: "Enter" });
    expect(plain).toBe(false);
  });

  test("the textarea sits inside the onboarding anchor", () => {
    const { textarea } = renderInput();
    expect(textarea.closest('[data-onboarding="chat-input"]')).not.toBeNull();
  });
});

describe("ChatInput placeholder", () => {
  test.each([
    ["chat", "Ask a question about your sources..."],
    ["deepResearch", "Ask a complex research question with multi-step investigation..."],
    [
      "literatureReview",
      "Describe the topic, research question, and requirements to generate a literature review...",
    ],
  ] as const)("%s", (mode, placeholder) => {
    renderInput({ mode, onAcademicDiscoveryFiltersChange: vi.fn() });
    expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
  });
});

describe("ChatInput toolbar", () => {
  test("chat mode: mode menu and filters, no database picker", () => {
    renderInput();
    expect(modeTrigger()).toHaveAccessibleName("Composer mode: Chat");
    expect(filtersTrigger()).toBeInTheDocument();
    expect(dbTrigger()).not.toBeInTheDocument();
  });

  test("the database picker shows with the Academic channel in chat", () => {
    renderInput({ sourceFilters: ["notebook", "academic"] });
    expect(dbTrigger()).toBeInTheDocument();
  });

  test("deep research defaults include Academic, so the picker shows", () => {
    renderInput({ mode: "deepResearch" });
    expect(dbTrigger()).toBeInTheDocument();
  });

  test("the database picker needs a notebook", () => {
    renderInput({ mode: "literatureReview", notebookId: null });
    expect(dbTrigger()).not.toBeInTheDocument();
  });

  test("literature review: picker plus academic filters when handled", () => {
    renderInput({ mode: "literatureReview", onAcademicDiscoveryFiltersChange: vi.fn() });
    expect(dbTrigger()).toBeInTheDocument();
    expect(filtersTrigger()).toBeInTheDocument();
  });

  test("literature review: the paper scope menu shows only with selected papers", () => {
    const scopeTrigger = () => screen.queryByRole("button", { name: /^Paper scope/ });
    const { rerender } = renderInput({
      mode: "literatureReview",
      onPaperScopeChange: vi.fn(),
    });
    expect(scopeTrigger()).not.toBeInTheDocument();

    rerender(
      chatInput({ mode: "literatureReview", onPaperScopeChange: vi.fn(), notebookPaperCount: 3 })
    );
    expect(scopeTrigger()).toHaveAccessibleName("Paper scope: Your 3 papers + search");
    expect(dbTrigger()).toBeInTheDocument();
  });

  test("literature review: only your papers hides the search controls", () => {
    renderInput({
      mode: "literatureReview",
      onPaperScopeChange: vi.fn(),
      onAcademicDiscoveryFiltersChange: vi.fn(),
      notebookPaperCount: 2,
      paperScope: "papers_only",
    });
    expect(dbTrigger()).not.toBeInTheDocument();
    expect(filtersTrigger()).not.toBeInTheDocument();
  });

  test("literature review without an academic handler has no filters", () => {
    renderInput({ mode: "literatureReview" });
    expect(filtersTrigger()).not.toBeInTheDocument();
  });

  test("chat without a channel handler has no filters", () => {
    renderInput({ onSourceFilterChange: undefined });
    expect(filtersTrigger()).not.toBeInTheDocument();
  });

  test("no model menu without a model handler", () => {
    renderInput();
    expect(modelTrigger()).not.toBeInTheDocument();
  });

  test("the model menu names the saved model", () => {
    const model = AVAILABLE_SMART_MODELS[1];
    renderInput({
      onModelChange: vi.fn(),
      chatSettings: { smartModel: model.id } as Props["chatSettings"],
    });
    expect(modelTrigger()).toHaveAccessibleName(`Model: ${model.name}`);
  });

  test("no voice control without a transcription handler", () => {
    renderInput();
    expect(voiceTrigger()).not.toBeInTheDocument();
  });

  test("voice control with a transcription handler", () => {
    renderInput({ onAppendTranscription: vi.fn() });
    expect(voiceTrigger()).toBeEnabled();
    expect(voiceTrigger()).toHaveAttribute("aria-pressed", "false");
  });

  test("voice is disabled without a notebook", () => {
    renderInput({ notebookId: null, onAppendTranscription: vi.fn() });
    expect(voiceTrigger()).toBeDisabled();
  });

  test("voice reflects the recording state", () => {
    voice.state = { voiceState: "recording", formatElapsed: "0:03" };
    renderInput({ onAppendTranscription: vi.fn() });
    expect(voiceTrigger()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("0:03")).toBeInTheDocument();
  });

  test("disabled disables every menu and send", () => {
    renderInput({
      disabled: true,
      onModelChange: vi.fn(),
      onAppendTranscription: vi.fn(),
      sourceFilters: ["notebook", "academic"],
    });
    for (const trigger of [modeTrigger(), dbTrigger(), filtersTrigger(), modelTrigger()]) {
      expect(trigger).toBeDisabled();
    }
    expect(voiceTrigger()).toBeDisabled();
    expect(screen.getByRole("button", { name: /\(Enter\)/ })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  test("streaming turns send into an enabled stop", async () => {
    const onStop = vi.fn();
    renderInput({ isStreaming: true, disabled: true, onStop });
    await userEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test("send needs a notebook", () => {
    renderInput({ notebookId: null });
    expect(screen.getByRole("button", { name: "Send message (Enter)" })).toBeDisabled();
  });

  test("send fires onSend", async () => {
    const { onSend } = renderInput();
    await userEvent.click(screen.getByRole("button", { name: "Send message (Enter)" }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe("ChatInput focus", () => {
  test("clicking blank toolbar space focuses the textarea", async () => {
    const { textarea, container } = renderInput();
    const addon = container.querySelector('[data-slot="input-group-addon"]');
    if (!addon) throw new Error("toolbar missing");
    await userEvent.click(addon);
    expect(textarea).toHaveFocus();
  });

  test("clicks inside a portalled popover don't move focus to the textarea", async () => {
    const onSourceFilterChange = vi.fn();
    const { textarea } = renderInput({ onSourceFilterChange });
    await userEvent.click(filtersTrigger() as HTMLElement);
    await userEvent.click(await screen.findByText("Web"));
    expect(onSourceFilterChange).toHaveBeenCalledWith(["notebook", "web"]);
    expect(textarea).not.toHaveFocus();
    await waitFor(() => expect(screen.getByText("Source channels")).toBeInTheDocument());
  });
});

describe("ChatInput textarea", () => {
  test("hints that Enter sends", () => {
    const { textarea } = renderInput();
    expect(textarea).toHaveAttribute("enterkeyhint", "send");
  });

  test("browsers with field-sizing leave the height to CSS", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const { textarea } = renderInput();
    expect(textarea.style.height).toBe("");
  });

  describe("without field-sizing (older iOS WebViews)", () => {
    let scrollHeight = 90;
    beforeEach(() => {
      vi.stubGlobal("CSS", { supports: () => false });
      vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(
        () => scrollHeight
      );
    });
    afterEach(() => {
      vi.restoreAllMocks();
      scrollHeight = 90;
    });

    test("fits the height to the content and re-fits on change", () => {
      const { textarea, rerender } = renderInput();
      expect(textarea.style.height).toBe("90px");
      scrollHeight = 120;
      rerender(chatInput({ value: "Hello\nworld" }));
      expect(textarea.style.height).toBe("120px");
    });

    test("caps the height at the computed max-height", () => {
      scrollHeight = 500;
      const { textarea, rerender } = renderInput();
      textarea.style.maxHeight = "160px";
      rerender(chatInput({ value: "Longer" }));
      expect(textarea.style.height).toBe("160px");
    });
  });
});
