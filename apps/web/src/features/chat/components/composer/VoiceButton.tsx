import { Mic } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import type { ChatVoiceState } from "../../hooks/useChatVoiceTranscription";
import { ControlTooltip } from "../ControlTooltip";

const LABELS: Record<ChatVoiceState, string> = {
  idle: "Dictate (microphone)",
  recording: "Stop and transcribe",
  transcribing: "Transcribing…",
};

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
  const label = LABELS[voiceState];
  return (
    <div className="flex items-center gap-1.5">
      {recording ? (
        <>
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/45 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-destructive" />
          </span>
          {/* Dropped in a narrow, crowded toolbar; the pressed mic and the dot still show recording. */}
          <span
            className="min-w-8 font-sans text-xs font-medium tabular-nums text-muted-foreground @max-sm/chat-input:sr-only"
            aria-live="polite"
          >
            {formatElapsed}
          </span>
        </>
      ) : null}
      <ControlTooltip label={label}>
        <Button
          type="button"
          variant="ghost-record"
          size="icon-sm"
          disabled={disabled || transcribing}
          aria-pressed={recording}
          aria-label={label}
          onClick={() => void toggleRecording()}
        >
          {transcribing ? <Spinner aria-hidden /> : <Mic aria-hidden />}
        </Button>
      </ControlTooltip>
    </div>
  );
}
