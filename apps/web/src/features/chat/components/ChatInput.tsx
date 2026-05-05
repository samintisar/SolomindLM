import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  Loader2,
  Mic,
  Search,
  Monitor,
  BookOpen,
  ChevronDown,
  Check,
  Square,
  FileText,
  X,
  SlidersHorizontal,
  Atom,
  Plus,
  Telescope,
  Globe,
  Newspaper,
  GraduationCap,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useChatVoiceTranscription } from "../hooks/useChatVoiceTranscription";
import { AVAILABLE_SMART_MODELS, findSmartModelById } from "@/shared/constants/models";
import { ModelBrandIcon } from "@/shared/components/icons/ModelBrandIcon";
import type { ChatSettings } from "@/shared/types";
import { Source, MentionedSource } from "@/shared/types/index";
import { filterSourcesByQuery } from "../utils/mentions";
import { QuoteBlocks } from "./QuoteBlocks";
import { AcademicFilters } from "@/features/sources/components/AcademicFilters";
import { AcademicFilterState } from "@/features/sources/components/AcademicFilters.types";
import { DEFAULT_ACADEMIC_FILTERS } from "@/features/sources/components/AcademicFilters.utils";
import { DATABASE_OPTIONS } from "@/features/sources/components/AcademicFilters.utils";

const SOURCE_FILTERS = [
  { id: "notebook", label: "Notebook sources", icon: BookOpen },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "web", label: "Web", icon: Globe },
  { id: "news", label: "News", icon: Newspaper },

] as const;

const DB_ROW_ICONS: Record<string, React.ElementType> = {
  BookOpen,
  FileText,
  Atom,
};

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Outermost wrapper (card + disclaimer) — use to measure floating composer height for scroll padding. */
  rootRef?: React.Ref<HTMLDivElement>;
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
  academicFilters?: AcademicFilterState;
  onAcademicFiltersChange?: (filters: AcademicFilterState) => void;
  chatSettings?: ChatSettings;
  onModelChange?: (modelId: string) => void;
  quotes?: Array<{ id: string; text: string }>;
  sources?: Source[];
  mentionedSources?: MentionedSource[];
  onMentionedSourcesChange?: (mentions: MentionedSource[]) => void;
}

function composerPlaceholder(deepResearch: boolean): string {
  return deepResearch
    ? "Ask a complex research question with multi-step investigation..."
    : "Ask a question about your sources...";
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  rootRef,
  disabled,
  waitingOnRemoteGeneration = false,
  isStreaming = false,
  onStop,
  notebookId,
  onAppendTranscription,
  onVoiceError,
  deepResearchEnabled = false,
  onToggleDeepResearch,
  sourceFilters: sourceFiltersProp,
  onSourceFilterChange,
  academicFilters,
  onAcademicFiltersChange,
  chatSettings,
  onModelChange,
  quotes,
  sources,
  mentionedSources,
  onMentionedSourcesChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const [mentionDropdownOpen, setMentionDropdownOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [databaseMenuOpen, setDatabaseMenuOpen] = useState(false);
  const databaseMenuRef = useRef<HTMLDivElement>(null);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);

  const activeFilters = sourceFiltersProp ?? ["notebook"];
  const academicActive = activeFilters.includes("academic");

  const currentModel = findSmartModelById(chatSettings?.smartModel);

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

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!mentionDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(e.target as Node) &&
        textareaRef.current !== e.target
      ) {
        setMentionDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mentionDropdownOpen]);

  // Options (+) menu & database popover: outside click
  useEffect(() => {
    if (!menuOpen && !databaseMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuOpen && menuRef.current && !menuRef.current.contains(t)) {
        setMenuOpen(false);
      }
      if (databaseMenuOpen && databaseMenuRef.current && !databaseMenuRef.current.contains(t)) {
        setDatabaseMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, databaseMenuOpen]);

  useEffect(() => {
    if (!filtersModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersModalOpen]);

  const detectMention = useCallback((text: string, cursorPos: number) => {
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) return null;

    const textBetweenAtAndCursor = textBeforeCursor.slice(lastAtIndex + 1);
    if (textBetweenAtAndCursor.includes(" ")) return null;

    const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
    if (charBeforeAt && charBeforeAt !== " " && charBeforeAt !== "\n") return null;

    return {
      query: textBetweenAtAndCursor,
      startIndex: lastAtIndex,
    };
  }, []);

  const filteredSources = useMemo(
    () => filterSourcesByQuery(sources ?? [], mentionQuery),
    [sources, mentionQuery]
  );

  const selectMention = useCallback(
    (source: Source) => {
      if (!textareaRef.current || !onMentionedSourcesChange) return;

      const cursorPos = textareaRef.current.selectionStart;
      const text = value;
      const mentionInfo = detectMention(text, cursorPos);

      if (!mentionInfo) return;

      const newText = text.slice(0, mentionInfo.startIndex) + text.slice(cursorPos);
      onChange(newText);

      const prev = mentionedSources ?? [];
      if (!prev.some((m) => m.documentId === source.id)) {
        const newMention: MentionedSource = {
          documentId: source.id,
          title: source.title,
        };
        onMentionedSourcesChange([...prev, newMention]);
      }

      setMentionDropdownOpen(false);
      setMentionQuery("");

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = mentionInfo.startIndex;
          textareaRef.current.setSelectionRange(pos, pos);
          textareaRef.current.focus();
        }
      });
    },
    [value, onChange, mentionedSources, onMentionedSourcesChange, detectMention]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionDropdownOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedMentionIndex((prev) =>
            prev < filteredSources.length - 1 ? prev + 1 : prev
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedMentionIndex((prev) => (prev > 0 ? prev - 1 : 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (filteredSources.length > 0) {
            selectMention(filteredSources[highlightedMentionIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          setMentionDropdownOpen(false);
          e.preventDefault();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          if (filteredSources.length > 0) {
            selectMention(filteredSources[highlightedMentionIndex]);
          }
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend, mentionDropdownOpen, filteredSources, highlightedMentionIndex, selectMention]
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

  const selectedDb = DATABASE_OPTIONS.find((d) => d.value === (academicFilters?.database ?? "all"));

  const filtersModal =
    filtersModalOpen &&
    academicActive &&
    onAcademicFiltersChange &&
    createPortal(
      <div
        className="fixed inset-0 z-[250] flex items-end justify-center p-4 font-sans sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <button
          type="button"
          className="absolute inset-0 bg-foreground/25 backdrop-blur-[1px] animate-in fade-in duration-150"
          aria-label="Close filters"
          onClick={() => setFiltersModalOpen(false)}
        />
        <div className="relative flex max-h-[min(92vh,40rem)] w-full max-w-md flex-col rounded-2xl border-2 border-border bg-card p-4 shadow-xl animate-in zoom-in-95 fade-in duration-150">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Filters</h2>
            <button
              type="button"
              onClick={() => setFiltersModalOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <AcademicFilters
            filters={academicFilters ?? DEFAULT_ACADEMIC_FILTERS}
            onChange={onAcademicFiltersChange}
            variant="modal"
            onApply={() => setFiltersModalOpen(false)}
          />
        </div>
      </div>,
      document.body
    );

  return (
    <div
      ref={rootRef}
      className="flex w-full min-w-0 max-w-3xl flex-col items-stretch gap-3 xl:max-w-4xl 2xl:max-w-5xl"
    >
      {filtersModal}
      <div
        data-onboarding="chat-input"
        className="@container/chat-input pointer-events-auto relative flex w-full min-w-0 flex-col gap-2 rounded-2xl border-2 border-border bg-card px-3 py-2 shadow-lg"
      >
        {quotes && quotes.length > 0 && <QuoteBlocks />}

        <div className="relative flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5 px-0.5 pt-0.5">
          {mentionedSources && mentionedSources.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1.5 self-start pt-2">
              {mentionedSources.map((mention, index) => (
                <div
                  key={`${mention.documentId}-${index}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-sans text-xs font-medium leading-tight text-primary"
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="max-w-[150px] truncate">{mention.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!onMentionedSourcesChange || !mentionedSources) return;
                      onMentionedSourcesChange(mentionedSources.filter((_, i) => i !== index));
                    }}
                    className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-primary/20"
                    title="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            placeholder={composerPlaceholder(deepResearchEnabled)}
            className="min-h-[44px] max-h-[min(200px,40vh)] min-w-0 flex-1 bg-transparent py-2 outline-none resize-none text-foreground placeholder:text-muted-foreground/70 font-serif text-base @min-[400px]/chat-input:text-lg"
            rows={1}
            value={value}
            onChange={(e) => {
              const newValue = e.target.value;
              const cursorPos = e.target.selectionStart;
              onChange(newValue);

              const mentionInfo = detectMention(newValue, cursorPos);
              if (mentionInfo) {
                setMentionQuery(mentionInfo.query);
                setMentionDropdownOpen(true);
                setHighlightedMentionIndex(0);
              } else {
                setMentionDropdownOpen(false);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />

          {mentionDropdownOpen && filteredSources.length > 0 && (
            <div
              ref={mentionDropdownRef}
              className="absolute left-0 top-auto bottom-full z-50 mb-2 w-64 max-h-60 overflow-y-auto rounded-xl border-2 border-border bg-card shadow-lg"
            >
              {filteredSources.map((source, index) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => selectMention(source)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                    index === highlightedMentionIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted/80"
                  }`}
                >
                  <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{source.title}</span>
                </button>
              ))}
            </div>
          )}
          {mentionDropdownOpen && filteredSources.length === 0 && (
            <div
              ref={mentionDropdownRef}
              className="absolute left-0 bottom-full z-50 mb-2 w-64 rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm text-muted-foreground shadow-lg"
            >
              No sources found
            </div>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 @min-[400px]/chat-input:flex-row @min-[400px]/chat-input:items-center @min-[400px]/chat-input:justify-between @min-[400px]/chat-input:gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {/* Research options (+): deep research + source channels */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen((prev) => !prev);
                  setDatabaseMenuOpen(false);
                }}
                disabled={Boolean(disabled)}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50 ${
                  deepResearchEnabled && !onToggleDeepResearch ? "ring-2 ring-primary/40 border-primary" : ""
                }`}
                title="Research options"
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                <Plus className={`size-4 transition-transform ${menuOpen ? "rotate-45" : ""}`} />
              </button>
              {menuOpen && (
                <div className="absolute bottom-full left-0 z-[60] mb-2 w-64 rounded-xl border-2 border-border bg-card p-3 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleDeepResearch?.();
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      deepResearchEnabled
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted/80"
                    }`}
                  >
                    <Telescope className="size-4 shrink-0" />
                    <span>Deep Research</span>
                  </button>
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">Sources</p>
                    {SOURCE_FILTERS.map(({ id, label, icon: Icon }) => {
                      const isActive = activeFilters.includes(id);
                      return (
                        <label
                          key={id}
                          className={`flex w-full cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                          } ${!onSourceFilterChange ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 text-left">{label}</span>
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-border bg-muted/60 px-2.5 py-1.5 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted/80"
                title="Deep research on — click to turn off"
              >
                <Telescope className="size-4 shrink-0 text-muted-foreground" />
                <span>Deep research</span>
              </button>
            )}

            {/* Research databases (academic only) */}
            {academicActive && onAcademicFiltersChange && (
              <div className="relative shrink-0" ref={databaseMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setDatabaseMenuOpen((o) => !o);
                    setMenuOpen(false);
                  }}
                  disabled={Boolean(disabled)}
                  aria-expanded={databaseMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Research databases"
                  className="inline-flex h-9 max-w-[min(100%,12rem)] items-center gap-2 rounded-full border-2 border-border bg-muted/50 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
                >
                  {selectedDb?.icon ? (
                    (() => {
                      const Ic = DB_ROW_ICONS[selectedDb.icon] ?? BookOpen;
                      return <Ic className="size-4 shrink-0 text-muted-foreground" />;
                    })()
                  ) : (
                    <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 truncate">{selectedDb?.label ?? "All Papers"}</span>
                  <ChevronDown
                    className={`size-4 shrink-0 opacity-60 transition-transform ${databaseMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {databaseMenuOpen && (
                  <div
                    className="absolute bottom-full left-0 z-[60] mb-2 w-[min(calc(100vw-2rem),18rem)] rounded-xl border-2 border-border bg-card p-3 shadow-lg"
                    role="listbox"
                    aria-label="Research databases"
                  >
                    <p className="px-1 pb-2 text-[11px] font-medium text-muted-foreground">
                      Research Databases:
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {DATABASE_OPTIONS.map((db) => {
                        const active = (academicFilters?.database ?? "all") === db.value;
                        const Icon = DB_ROW_ICONS[db.icon] ?? BookOpen;
                        return (
                          <button
                            key={db.value}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              onAcademicFiltersChange({
                                ...(academicFilters ?? DEFAULT_ACADEMIC_FILTERS),
                                database: db.value,
                              });
                              setDatabaseMenuOpen(false);
                            }}
                            className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                              active ? "bg-muted/70" : "hover:bg-muted/80"
                            }`}
                          >
                            <span
                              className={`mt-1.5 size-4 shrink-0 rounded-full border-2 border-primary ${
                                active ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--card)]" : ""
                              }`}
                              aria-hidden
                            />
                            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-tight">
                                {db.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">
                                {db.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {academicActive && onAcademicFiltersChange && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setDatabaseMenuOpen(false);
                  setFiltersModalOpen(true);
                }}
                disabled={Boolean(disabled)}
                className="inline-flex h-9 items-center gap-2 rounded-full px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
              >
                <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
                Filters
              </button>
            )}
          </div>

          <div className="flex min-h-10 min-w-0 shrink-0 items-center justify-end gap-2">
            {onModelChange && (
              <div className="relative max-w-full min-w-0" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => setModelDropdownOpen((prev) => !prev)}
                  disabled={Boolean(disabled)}
                  aria-expanded={modelDropdownOpen}
                  aria-haspopup="listbox"
                  className={[
                    "group h-8 max-w-full min-w-0 inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 font-sans text-sm font-medium tabular-nums text-muted-foreground",
                    "transition-[color,background-color,transform] duration-150",
                    "hover:bg-muted/45 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    modelDropdownOpen && "bg-muted/40 text-foreground",
                  ].join(" ")}
                  title={currentModel?.name ?? "Choose model"}
                >
                  <ModelBrandIcon brand={currentModel?.brand ?? "openai"} />
                  <span className="min-w-0 max-w-[min(10rem,45vw)] truncate @max-[340px]/chat-input:sr-only @min-[400px]/chat-input:max-w-[10rem] @min-[520px]/chat-input:max-w-[14rem]">
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
                      <p className="text-[11px] font-medium leading-none text-muted-foreground">
                        Model
                      </p>
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
                              <Check
                                className="size-3.5 shrink-0 text-primary"
                                strokeWidth={2.75}
                                aria-hidden
                              />
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
                  voice.voiceState === "recording" ? "flex items-center gap-2" : "contents"
                }
              >
                {voice.voiceState === "recording" && (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/45 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive shadow-sm" />
                    </span>
                    <span
                      className="min-w-11 text-xs font-medium tabular-nums text-muted-foreground"
                      aria-live="polite"
                    >
                      {voice.formatElapsed}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void voice.toggleRecording()}
                  disabled={
                    Boolean(disabled) || !notebookId || voice.voiceState === "transcribing"
                  }
                  className={[
                    "group relative inline-flex shrink-0 items-center justify-center rounded-md",
                    "transition-all duration-200 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    voice.voiceState === "transcribing" &&
                      "size-8 bg-primary/12 text-primary shadow-sm ring-1 ring-inset ring-primary/25",
                    voice.voiceState === "recording" &&
                      "size-8 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:translate-y-px",
                    voice.voiceState !== "recording" &&
                      voice.voiceState !== "transcribing" &&
                      "min-h-9 min-w-9 p-1.5 text-muted-foreground hover:text-primary active:scale-[0.98]",
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic
                      className={[
                        "h-4 w-4 transition-transform duration-200",
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
              disabled={!isStreaming && (!value.trim() || disabled || !notebookId)}
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl p-0 transition-all shadow-md active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
                isStreaming
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : waitingOnRemoteGeneration
                    ? "border border-border bg-muted text-muted-foreground shadow-none"
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
                <Square className="h-4 w-4 fill-current" />
              ) : waitingOnRemoteGeneration ? (
                <Monitor className="h-5 w-5 animate-pulse" aria-hidden />
              ) : disabled ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : deepResearchEnabled ? (
                <Search className="h-5 w-5" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
      <p className="pointer-events-none px-1 text-center text-[11px] leading-snug text-muted-foreground">
        SolomindLM can be inaccurate; please double check its responses.
      </p>
    </div>
  );
};
