import React, { useRef, useEffect, useCallback } from "react";
import { ArrowUp, Loader2, Mic } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useChatVoiceTranscription } from "../hooks/useChatVoiceTranscription";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  notebookId?: string | null;
  onAppendTranscription?: (text: string) => void;
  onVoiceError?: (message: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  notebookId,
  onAppendTranscription,
  onVoiceError,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const voice = useChatVoiceTranscription({
    notebookId: (notebookId ?? null) as Id<"notebooks"> | null,
    disabled: Boolean(disabled) || !onAppendTranscription,
    onTranscribed: (text) => {
      onAppendTranscription?.(text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (message) => onVoiceError?.(message) ?? console.error(message),
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  return (
    <div className="w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl bg-card border-2 border-border shadow-lg rounded-2xl py-1.5 px-2 flex flex-col gap-1 relative">
      <textarea
        ref={textareaRef}
        placeholder="Ask a question about your sources..."
        className="w-full bg-transparent border-none py-2 px-3 resize-none outline-none text-foreground placeholder:text-muted-foreground/70 min-h-[44px] max-h-[160px] font-serif text-lg"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <div className="flex justify-between items-center gap-2 px-1.5 pb-0.5 w-full">
        {onAppendTranscription ? (
          <div className="flex items-center gap-1.5 min-h-10">
            {voice.voiceState === "recording" && (
              <span
                className="text-xs tabular-nums text-muted-foreground font-medium min-w-[2.5rem]"
                aria-live="polite"
              >
                {voice.formatElapsed}
              </span>
            )}
            <button
              type="button"
              onClick={() => void voice.toggleRecording()}
              disabled={Boolean(disabled) || !notebookId || voice.voiceState === "transcribing"}
              className={`shrink-0 w-10 h-10 rounded-full border-2 border-border bg-background flex items-center justify-center hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                voice.voiceState === "recording" ? "ring-2 ring-destructive/40" : ""
              }`}
              title={
                voice.voiceState === "recording"
                  ? "Stop and transcribe"
                  : voice.voiceState === "transcribing"
                    ? "Transcribing…"
                    : "Dictate (microphone)"
              }
              aria-pressed={voice.voiceState === "recording" ? "true" : "false"}
            >
              {voice.voiceState === "transcribing" ? (
                <Loader2 className="w-4 h-4 animate-spin text-foreground" />
              ) : (
                <Mic
                  className={
                    voice.voiceState === "recording" ? "w-4 h-4 text-destructive" : "w-4 h-4"
                  }
                />
              )}
            </button>
          </div>
        ) : (
          <span className="min-w-0" />
        )}
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled || !notebookId}
          className="p-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          title={value.trim() ? "Send message (Enter)" : "Type a message to send"}
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowUp className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
};
