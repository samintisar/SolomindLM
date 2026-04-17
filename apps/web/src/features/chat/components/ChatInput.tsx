import React, { useRef, useEffect, useCallback } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  notebookId?: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  notebookId,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="flex justify-end items-center px-1.5 pb-0.5">
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
