import { Mic } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import type { ChatVoiceState } from "../../hooks/useChatVoiceTranscription";
import { ControlTooltip } from "../ControlTooltip";

/** Visible hint per state. The accessible name stays "Voice input"; `aria-pressed` carries recording. */
const HINTS: Record<ChatVoiceState, string> = {
  idle: "Dictate (microphone)",
  recording: "Stop and transcribe",
  transcribing: "Transcribing…",
};

/** Screen-reader announcement on entering `state`; empty when there's nothing to say. */
function announcement(state: ChatVoiceState, previous: ChatVoiceState): string {
  if (state === "recording") return "Recording started";
  if (state === "transcribing") return "Transcribing…";
  // Transcribing → idle is covered by the text landing in the draft (or an error toast).
  return previous === "recording" ? "Recording stopped" : "";
}

type VoiceButtonProps = {
  /** From `useChatVoiceTranscription`. */
  voiceState: ChatVoiceState;
  /** Elapsed recording time, e.g. "0:07". */
  formatElapsed: string;
  toggleRecording: () => Promise<void>;
  disabled?: boolean;
};

/** Dictation toggle. While recording it shows a live dot and the elapsed time beside the mic. */
export function VoiceButton({
  voiceState,
  formatElapsed,
  toggleRecording,
  disabled = false,
}: VoiceButtonProps) {
  const recording = voiceState === "recording";
  const transcribing = voiceState === "transcribing";
  const [previousState, setPreviousState] = useState(voiceState);
  const [status, setStatus] = useState("");
  // Derive the announcement from the state change during render (no effect, no timers).
  if (previousState !== voiceState) {
    setPreviousState(voiceState);
    setStatus(announcement(voiceState, previousState));
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Always mounted so screen readers pick up changes to it. */}
      <span className="sr-only" role="status">
        {status}
      </span>
      {recording ? (
        <>
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/45 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-destructive" />
          </span>
          {/* Visual only (the status line announces recording). Dropped in a narrow, crowded
              toolbar; the pressed mic and the dot still show recording. */}
          <span
            className="min-w-8 font-sans text-xs font-medium tabular-nums text-muted-foreground @max-sm/chat-input:hidden"
            aria-hidden
          >
            {formatElapsed}
          </span>
        </>
      ) : null}
      <ControlTooltip label={HINTS[voiceState]}>
        <Button
          type="button"
          variant="ghost-toggle-destructive"
          size="icon-md"
          disabled={disabled || transcribing}
          aria-pressed={recording}
          aria-label="Voice input"
          onClick={() => void toggleRecording()}
        >
          {transcribing ? <Spinner aria-hidden /> : <Mic aria-hidden />}
        </Button>
      </ControlTooltip>
    </div>
  );
}
