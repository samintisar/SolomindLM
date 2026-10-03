import { ArrowUp, Monitor, Search, Square } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import type { ChatComposerMode } from "./constants";

const REMOTE_GENERATION_TITLE =
  "A response is generating in another tab or device. Switch there to stop, or wait for it to finish.";

/** "(Enter)" in these titles is an e2e hook (`button[title*="(Enter)"]`). */
const SEND_TITLES: Record<ChatComposerMode, string> = {
  chat: "Send message (Enter)",
  deepResearch: "Start deep research (Enter)",
  literatureReview: "Start literature review (Enter)",
};

type SendButtonProps = {
  mode: ChatComposerMode;
  /** The draft has non-whitespace text. */
  hasText: boolean;
  isStreaming: boolean;
  /** Input is busy (sending or blocked); shows a spinner. */
  disabled: boolean;
  /** Generation is running in another tab or device, so this one can't stop it. */
  waitingOnRemoteGeneration?: boolean;
  /** Sending is unavailable for another reason (e.g. no notebook), without a spinner. */
  blocked?: boolean;
  onSend: () => void;
  onStop?: () => void;
};

/**
 * Composer submit control: send (per-mode icon and label), stop while streaming, or a remote-generation
 * notice. Its `title` doubles as the accessible name and the hover hint.
 */
export function SendButton({
  mode,
  hasText,
  isStreaming,
  disabled,
  waitingOnRemoteGeneration = false,
  blocked = false,
  onSend,
  onStop,
}: SendButtonProps) {
  if (isStreaming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="icon-md"
        title="Stop generating"
        aria-label="Stop generating"
        onClick={onStop}
      >
        <Square className="fill-current" aria-hidden />
      </Button>
    );
  }

  const sendDisabled = !hasText || disabled || blocked;

  if (waitingOnRemoteGeneration) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-md"
        disabled={sendDisabled}
        title={REMOTE_GENERATION_TITLE}
        aria-label={REMOTE_GENERATION_TITLE}
        onClick={onSend}
      >
        <Monitor className="size-5 animate-pulse" aria-hidden />
      </Button>
    );
  }

  const label = hasText ? SEND_TITLES[mode] : "Type a message to send";
  const Icon = mode === "chat" ? ArrowUp : Search;
  return (
    <Button
      type="button"
      size="icon-md"
      disabled={sendDisabled}
      title={label}
      aria-label={label}
      onClick={onSend}
    >
      {disabled ? (
        <Spinner aria-hidden className="size-5" />
      ) : (
        <Icon className="size-5" aria-hidden />
      )}
    </Button>
  );
}
