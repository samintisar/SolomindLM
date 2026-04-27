import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  ArrowUp,
  Loader2,
  Mic,
  Plus,
  Search,
  Telescope,
  BookOpen,
  Globe,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useChatVoiceTranscription } from "../hooks/useChatVoiceTranscription";

const SOURCE_FILTERS = [
  { id: "notebook", label: "Notebook sources", icon: BookOpen },
  { id: "web", label: "Web", icon: Globe },
  { id: "news", label: "News", icon: Newspaper },
  { id: "finance", label: "Finance", icon: TrendingUp },
] as const;

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  notebookId?: string | null;
  onAppendTranscription?: (text: string) => void;
  onVoiceError?: (message: string) => void;
  deepResearchEnabled?: boolean;
  onToggleDeepResearch?: () => void;
  sourceFilters?: string[];
  onSourceFilterChange?: (filters: string[]) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  notebookId,
  onAppendTranscription,
  onVoiceError,
  deepResearchEnabled,
  onToggleDeepResearch,
  sourceFilters,
  onSourceFilterChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeFilters = sourceFilters ?? ["notebook"];

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

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  const toggleFilter = (id: string) => {
    if (!onSourceFilterChange) return;
    if (activeFilters.includes(id)) {
      if (activeFilters.length > 1) {
        onSourceFilterChange(activeFilters.filter((f) => f !== id));
      }
    } else {
      onSourceFilterChange([...activeFilters, id]);
    }
  };

  return (
    <div className="w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl bg-card border-2 border-border shadow-lg rounded-2xl py-1.5 px-2 flex flex-col gap-1 relative">
      <textarea
        ref={textareaRef}
        placeholder={deepResearchEnabled ? "Ask a complex research question with multi-step investigation..." : "Ask a question about your sources..."}
        className="w-full bg-transparent border-none py-2 px-3 resize-none outline-none text-foreground placeholder:text-muted-foreground/70 min-h-[44px] max-h-[160px] font-serif text-lg"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <div className="flex justify-between items-center gap-2 px-1.5 pb-0.5 w-full">
        <div className="flex items-center gap-1.5 min-h-10">
          {/* "+" button with dropup menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              disabled={Boolean(disabled)}
              className={`shrink-0 size-8 rounded-full border-2 border-border bg-background flex items-center justify-center hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                deepResearchEnabled && !onToggleDeepResearch
                  ? "ring-2 ring-primary/40 border-primary"
                  : ""
              }`}
              title="Research options"
            >
              <Plus className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-45" : ""}`} />
            </button>

            {/* Dropup menu */}
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-card border-2 border-border rounded-xl shadow-lg p-3 z-50">
                {/* Deep Research toggle */}
                <button
                  type="button"
                  onClick={() => {
                    onToggleDeepResearch?.();
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                    deepResearchEnabled
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/80 text-foreground"
                  }`}
                >
                  <Telescope className="w-4 h-4 shrink-0" />
                  <span>Deep Research</span>
                </button>

                {/* Source filters */}
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium px-3 mb-1.5">Sources</p>
                  {SOURCE_FILTERS.map(({ id, label, icon: Icon }) => {
                    const isActive = activeFilters.includes(id);
                    return (
                      <label
                        key={id}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm cursor-pointer select-none ${
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        } ${!onSourceFilterChange ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 min-w-0 text-left">{label}</span>
                        <input
                          type="checkbox"
                          checked={isActive}
                          disabled={!onSourceFilterChange}
                          onChange={() => toggleFilter(id)}
                          className="h-4 w-4 shrink-0 rounded border-2 border-border bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {deepResearchEnabled && onToggleDeepResearch && (
            <button
              type="button"
              onClick={() => onToggleDeepResearch()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-muted/60 px-2.5 py-1.5 text-sm font-medium text-foreground/90 hover:bg-muted/80 transition-colors"
              title="Deep research on — click to turn off"
            >
              <Telescope className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span>Deep research</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 min-h-10">
          {onAppendTranscription && (
            <div
              className={
                voice.voiceState === "recording"
                  ? "flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.07] pl-2.5 pr-1.5 py-0.5 shadow-sm ring-1 ring-inset ring-primary/10"
                  : "contents"
              }
            >
              {voice.voiceState === "recording" && (
                <span
                  className="text-xs tabular-nums font-medium text-primary min-w-[2.75rem]"
                  aria-live="polite"
                >
                  {voice.formatElapsed}
                </span>
              )}
              <button
                type="button"
                onClick={() => void voice.toggleRecording()}
                disabled={Boolean(disabled) || !notebookId || voice.voiceState === "transcribing"}
                className={[
                  "group relative shrink-0 size-8 rounded-full flex items-center justify-center",
                  "transition-all duration-200 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  voice.voiceState === "transcribing" &&
                    "bg-primary/12 ring-1 ring-inset ring-primary/25 text-primary shadow-sm",
                  voice.voiceState === "recording" &&
                    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:translate-y-px",
                  voice.voiceState !== "recording" &&
                    voice.voiceState !== "transcribing" &&
                    "border border-border/80 bg-gradient-to-b from-background to-muted/30 text-muted-foreground shadow-sm",
                  voice.voiceState !== "recording" &&
                    voice.voiceState !== "transcribing" &&
                    "hover:border-primary/35 hover:from-primary/[0.06] hover:to-primary/[0.03] hover:text-primary",
                  voice.voiceState !== "recording" &&
                    voice.voiceState !== "transcribing" &&
                    "active:scale-[0.98]",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mic
                    className={[
                      "w-4 h-4 transition-transform duration-200",
                      voice.voiceState !== "recording" && "group-hover:scale-105",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                )}
              </button>
            </div>
          )}
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled || !notebookId}
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg p-0 transition-all shadow-md active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
            deepResearchEnabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
          title={value.trim() ? (deepResearchEnabled ? "Start deep research (Enter)" : "Send message (Enter)") : "Type a message to send"}
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : deepResearchEnabled ? (
            <Search className="w-5 h-5" />
          ) : (
            <ArrowUp className="w-5 h-5" />
          )}
        </button>
        </div>
      </div>
    </div>
  );
};
