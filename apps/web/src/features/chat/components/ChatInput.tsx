import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  ArrowUp,
  Loader2,
  Mic,
  Plus,
  Search,
  Telescope,
  Monitor,
  BookOpen,
  Globe,
  Newspaper,
  TrendingUp,
  GraduationCap,
  ChevronDown,
  Check,
  Square,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useChatVoiceTranscription } from "../hooks/useChatVoiceTranscription";
import { AVAILABLE_SMART_MODELS, findSmartModelById } from "@/shared/constants/models";
import { ModelBrandIcon } from "@/shared/components/icons/ModelBrandIcon";
import type { ChatSettings } from "@/shared/types";

const SOURCE_FILTERS = [
  { id: "notebook", label: "Notebook sources", icon: BookOpen },
  { id: "web", label: "Web", icon: Globe },
  { id: "news", label: "News", icon: Newspaper },
  { id: "finance", label: "Finance", icon: TrendingUp },
  { id: "academic", label: "Academic", icon: GraduationCap },
] as const;

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  /** True when Convex reports in-flight generation for this conversation but this session is not the one consuming the stream (another tab/device). */
  waitingOnRemoteGeneration?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  notebookId?: string | null;
  onAppendTranscription?: (text: string) => void;
  onVoiceError?: (message: string) => void;
  deepResearchEnabled?: boolean;
  onToggleDeepResearch?: () => void;
  sourceFilters?: string[];
  onSourceFilterChange?: (filters: string[]) => void;
  chatSettings?: ChatSettings;
  onModelChange?: (modelId: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  waitingOnRemoteGeneration = false,
  isStreaming = false,
  onStop,
  notebookId,
  onAppendTranscription,
  onVoiceError,
  deepResearchEnabled,
  onToggleDeepResearch,
  sourceFilters,
  onSourceFilterChange,
  chatSettings,
  onModelChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const currentModel = findSmartModelById(chatSettings?.smartModel);

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

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelDropdownOpen]);

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
    <div className="flex w-full max-w-3xl flex-col items-stretch gap-3 xl:max-w-4xl 2xl:max-w-5xl">
      <div
        data-onboarding="chat-input"
        className="pointer-events-auto relative flex w-full flex-col gap-1 rounded-2xl border-2 border-border bg-card px-2 py-1.5 shadow-lg"
      >
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
          {/* Model selector */}
          {onModelChange && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setModelDropdownOpen((prev) => !prev)}
                disabled={Boolean(disabled)}
                aria-expanded={modelDropdownOpen}
                aria-haspopup="listbox"
                className={[
                  "group h-8 shrink-0 inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 font-sans text-sm font-medium tabular-nums text-muted-foreground",
                  "transition-[color,background-color,transform] duration-150",
                  "hover:bg-muted/45 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  modelDropdownOpen && "bg-muted/40 text-foreground",
                ].join(" ")}
                title="Model"
              >
                <ModelBrandIcon brand={currentModel?.brand ?? "openai"} />
                <span className="max-w-[6.5rem] truncate sm:max-w-[10rem]">
                  {currentModel?.name ?? "GPT-OSS 120B"}
                </span>
                <ChevronDown
                  className={[
                    "size-3.5 shrink-0 opacity-50 transition-transform duration-200",
                    "group-hover:opacity-70",
                    modelDropdownOpen && "-rotate-180 opacity-70",
                  ].join(" ")}
                  strokeWidth={2.25}
                  aria-hidden
                />
              </button>

              {modelDropdownOpen && (
                <div
                  className="absolute bottom-full right-0 z-50 mb-2 min-w-[13.5rem] max-w-[min(18rem,calc(100vw-2rem))] max-h-[min(70vh,22rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-border/80 bg-popover py-1 font-sans text-popover-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-150"
                  role="listbox"
                  aria-label="Choose model"
                >
                  <div className="border-b border-border/50 px-3 py-2">
                    <p className="text-[11px] font-medium leading-none text-muted-foreground">Model</p>
                  </div>
                  <div className="p-1">
                    {AVAILABLE_SMART_MODELS.map((model) => {
                      const isActive = chatSettings?.smartModel === model.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            onModelChange(model.id);
                            setModelDropdownOpen(false);
                          }}
                          className={[
                            "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                            isActive
                              ? "bg-primary/12 font-medium text-primary"
                              : "text-foreground/90 hover:bg-muted/80",
                          ].join(" ")}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                            <ModelBrandIcon brand={model.brand} />
                            <span className="min-w-0 flex-1 truncate">{model.name}</span>
                          </span>
                          {isActive && (
                            <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2.75} aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {onAppendTranscription && (
            <div
              className={
                voice.voiceState === "recording"
                  ? "flex items-center gap-2"
                  : "contents"
              }
            >
              {voice.voiceState === "recording" && (
                <>
                  <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/45 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive shadow-sm" />
                  </span>
                  <span
                    className="text-xs tabular-nums font-medium text-muted-foreground min-w-11"
                    aria-live="polite"
                  >
                    {voice.formatElapsed}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => void voice.toggleRecording()}
                disabled={Boolean(disabled) || !notebookId || voice.voiceState === "transcribing"}
                className={[
                  "group relative shrink-0 inline-flex items-center justify-center rounded-md",
                  "transition-all duration-200 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  voice.voiceState === "transcribing" &&
                    "size-8 bg-primary/12 ring-1 ring-inset ring-primary/25 text-primary shadow-sm",
                  voice.voiceState === "recording" &&
                    "size-8 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:translate-y-px",
                  voice.voiceState !== "recording" &&
                    voice.voiceState !== "transcribing" &&
                    "p-1.5 min-h-9 min-w-9 text-muted-foreground hover:text-primary active:scale-[0.98]",
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
          onClick={isStreaming ? onStop : onSend}
          disabled={(!isStreaming && (!value.trim() || disabled || !notebookId))}
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg p-0 transition-all shadow-md active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
            isStreaming
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : waitingOnRemoteGeneration
                ? "border border-border bg-muted text-muted-foreground shadow-none"
                : deepResearchEnabled
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
          title={
            isStreaming
              ? "Stop generating"
              : waitingOnRemoteGeneration
                ? "A response is generating in another tab or device. Switch there to stop, or wait for it to finish."
              : value.trim()
                ? deepResearchEnabled
                  ? "Start deep research (Enter)"
                  : "Send message (Enter)"
                : "Type a message to send"
          }
        >
          {isStreaming ? (
            <Square className="w-4 h-4 fill-current" />
          ) : waitingOnRemoteGeneration ? (
            <Monitor className="w-5 h-5 animate-pulse" aria-hidden />
          ) : disabled ? (
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
      <p className="pointer-events-none text-center text-[11px] leading-snug text-muted-foreground px-1">
        SolomindLM can be inaccurate; please double check its responses.
      </p>
    </div>
  );
};
