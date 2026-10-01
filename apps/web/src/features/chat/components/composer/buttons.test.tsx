import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
import { SendButton } from "./SendButton";
import { VoiceButton } from "./VoiceButton";

function renderSend(props: Partial<ComponentProps<typeof SendButton>> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(
    <SendButton
      mode="chat"
      hasText
      isStreaming={false}
      disabled={false}
      onSend={onSend}
      onStop={onStop}
      {...props}
    />
  );
  return { onSend, onStop, button: screen.getByRole("button") };
}

describe("SendButton", () => {
  test("send state carries the (Enter) title and fires onSend", async () => {
    const { onSend } = renderSend();
    const b = screen.getByRole("button", { name: /send message/i });
    expect(b).toHaveAttribute("title", expect.stringContaining("(Enter)"));
    await userEvent.click(b);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["deepResearch", "Start deep research (Enter)"],
    ["literatureReview", "Start literature review (Enter)"],
  ] as const)("%s names the action", (mode, name) => {
    const { button } = renderSend({ mode });
    expect(button).toHaveAccessibleName(name);
    expect(button).toHaveAttribute("title", name);
  });

  test("streaming shows stop, enabled even without text", async () => {
    const { onStop, onSend } = renderSend({ hasText: false, isStreaming: true, disabled: true });
    const b = screen.getByRole("button", { name: "Stop generating" });
    expect(b).toBeEnabled();
    expect(b).toHaveAttribute("title", "Stop generating");
    await userEvent.click(b);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  test("empty input disables send and drops the (Enter) hint", () => {
    const { button } = renderSend({ hasText: false });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName("Type a message to send");
    expect(button.getAttribute("title")).not.toContain("(Enter)");
  });

  test("disabled shows a hidden spinner and blocks sending", () => {
    const { button } = renderSend({ disabled: true });
    expect(button).toBeDisabled();
    // The spinner is decorative inside a labelled button.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });

  test("blocked disables send without a spinner", () => {
    const { button } = renderSend({ blocked: true });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
  });

  test("a generation in another tab explains itself", () => {
    const { button } = renderSend({ waitingOnRemoteGeneration: true, disabled: true });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName(/generating in another tab or device/);
    expect(button.querySelector(".animate-pulse")).not.toBeNull();
  });
});

function renderVoice(props: Partial<ComponentProps<typeof VoiceButton>> = {}) {
  const toggleRecording = vi.fn(async () => {});
  render(
    <VoiceButton
      voiceState="idle"
      formatElapsed="0:00"
      toggleRecording={toggleRecording}
      {...props}
    />
  );
  return { toggleRecording };
}

describe("VoiceButton", () => {
  const voiceButton = () => screen.getByRole("button", { name: "Voice input" });

  test("idle: unpressed, stably named, starts recording", async () => {
    const { toggleRecording } = renderVoice();
    const b = voiceButton();
    expect(b).toHaveAttribute("aria-pressed", "false");
    expect(b).not.toHaveAttribute("title");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByText("0:00")).not.toBeInTheDocument();
    await userEvent.click(b);
    expect(toggleRecording).toHaveBeenCalledTimes(1);
  });

  test("the tooltip carries the per-state hint", async () => {
    renderVoice();
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Dictate (microphone)");
  });

  test("recording: pressed, same name, visual-only timer", async () => {
    const { toggleRecording } = renderVoice({ voiceState: "recording", formatElapsed: "0:07" });
    const b = voiceButton();
    expect(b).toHaveAttribute("aria-pressed", "true");
    const timer = screen.getByText("0:07");
    expect(timer).toHaveAttribute("aria-hidden");
    expect(timer).not.toHaveAttribute("aria-live");
    await userEvent.click(b);
    expect(toggleRecording).toHaveBeenCalledTimes(1);
  });

  test("transcribing: disabled with a hidden spinner", () => {
    renderVoice({ voiceState: "transcribing" });
    const b = voiceButton();
    expect(b).toBeDisabled();
    expect(b.querySelector(".animate-spin")).not.toBeNull();
    // Only the announcement region has role=status; the spinner is hidden.
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  test("announces state changes in a persistent status region", () => {
    const toggleRecording = vi.fn(async () => {});
    const props = { formatElapsed: "0:00", toggleRecording };
    const { rerender } = render(<VoiceButton voiceState="idle" {...props} />);
    const status = screen.getByRole("status");
    rerender(<VoiceButton voiceState="recording" {...props} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Recording started");
    rerender(<VoiceButton voiceState="transcribing" {...props} />);
    expect(status).toHaveTextContent("Transcribing…");
    rerender(<VoiceButton voiceState="idle" {...props} />);
    expect(status).toBeEmptyDOMElement();
    rerender(<VoiceButton voiceState="recording" {...props} />);
    rerender(<VoiceButton voiceState="idle" {...props} />);
    expect(status).toHaveTextContent("Recording stopped");
  });

  test("disabled blocks recording", () => {
    renderVoice({ disabled: true });
    expect(voiceButton()).toBeDisabled();
  });
});
