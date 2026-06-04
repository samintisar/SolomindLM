import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowUp,
  Atom,
  BookOpen,
  BriefcaseMedical,
  Check,
  ChevronDown,
  FileText,
  Globe,
  GraduationCap,
  ListFilter,
  Loader2,
  MessageCircle,
  Mic,
  Monitor,
  Newspaper,
  Search,
  Square,
  Telescope,
  TrendingUp,
} from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AcademicDiscoveryFiltersSection,
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "@/features/sources/components/AcademicDiscoveryFiltersSection";
import { ModelBrandIcon } from "@/shared/components/icons/ModelBrandIcon";
import { AVAILABLE_SMART_MODELS, findSmartModelById } from "@/shared/constants/models";
import type { ChatSettings } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { useChatVoiceTranscription } from "../hooks/useChatVoiceTranscription";

const SOURCE_FILTERS = [
  { id: "notebook", label: "Notebook sources", icon: BookOpen },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "web", label: "Web", icon: Globe },
  { id: "news", label: "News", icon: Newspaper },
  { id: "finance", label: "Finance", icon: TrendingUp },
] as const;

/** Default source channels when the composer is in Chat mode. */
export const CHAT_DEFAULT_SOURCE_FILTERS = ["notebook"] as const;

/** Default source channels when the composer is in Deep Research mode. */
export const DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS = ["notebook", "web", "academic"] as const;

export type ChatComposerMode = "chat" | "deepResearch" | "literatureReview";

export type ResearchDatabaseOption = "all" | "pubmed" | "arxiv";

const COMPOSER_MODES: {
  id: ChatComposerMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "deepResearch", label: "Deep Research", icon: Telescope },
  { id: "literatureReview", label: "Literature Review", icon: FileText },
];

const RESEARCH_DATABASES: {
  id: ResearchDatabaseOption;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "all",
    title: "All Papers",
    description: "Search from 200M+ research papers",
    icon: BookOpen,
  },
  {
    id: "pubmed",
    title: "PubMed",
    description: "39M+ biomedical and life-science literature",
    icon: BriefcaseMedical,
  },
  {
    id: "arxiv",
    title: "ArXiv",
    description: "Explore research preprints from arXiv",
    icon: Atom,
  },
];

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
  mode: ChatComposerMode;
  onModeChange: (mode: ChatComposerMode) => void;
  researchDatabase: ResearchDatabaseOption;
  onResearchDatabaseChange: (db: ResearchDatabaseOption) => void;
  sourceFilters?: string[];
  onSourceFilterChange?: (filters: string[]) => void;
  /** Academic sub-filters when the Academic channel is enabled (persisted in session). */
  academicDiscoveryFilters?: DiscoveryAcademicFilterState;
  onAcademicDiscoveryFiltersChange?: (patch: Partial<DiscoveryAcademicFilterState>) => void;
  chatSettings?: ChatSettings;
  onModelChange?: (modelId: string) => void;
}

type OpenComposerMenu = "none" | "mode" | "corpus" | "filters" | "model";

type DropUpAlign = "left" | "right";

function useDropUpMenuStyle(
  anchorRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  align: DropUpAlign
) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 8,
        ...(align === "right"
          ? { right: window.innerWidth - rect.right, left: "auto" }
          : { left: rect.left, right: "auto" }),
        visibility: "visible",
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open, align]);

  return style;
}

type ComposerDropUpProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  align?: DropUpAlign;
  panelRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

function ComposerDropUp({
  anchorRef,
  open,
  align = "left",
  panelRef,
  className,
  children,
  ...rest
}: ComposerDropUpProps) {
  const style = useDropUpMenuStyle(anchorRef, open, align);
  if (!open) return null;
  return createPortal(
    <div ref={panelRef} className={className} style={{ ...style, zIndex: 200 }} {...rest}>
      {children}
    </div>,
    document.body
  );
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
  mode,
  onModeChange,
  researchDatabase,
  onResearchDatabaseChange,
  sourceFilters,
  onSourceFilterChange,
  academicDiscoveryFilters,
  onAcademicDiscoveryFiltersChange,
  chatSettings,
  onModelChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const modeAnchorRef = useRef<HTMLButtonElement>(null);
  const modePanelRef = useRef<HTMLDivElement>(null);
  const corpusAnchorRef = useRef<HTMLButtonElement>(null);
  const corpusPanelRef = useRef<HTMLDivElement>(null);
  const filtersAnchorRef = useRef<HTMLButtonElement>(null);
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const modelAnchorRef = useRef<HTMLButtonElement>(null);
  const modelPanelRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenComposerMenu>("none");

  const menuInteractionRefs = (menu: OpenComposerMenu) => {
    switch (menu) {
      case "mode":
        return [modeAnchorRef, modePanelRef];
      case "corpus":
        return [corpusAnchorRef, corpusPanelRef];
      case "filters":
        return [filtersAnchorRef, filtersPanelRef];
      case "model":
        return [modelAnchorRef, modelPanelRef];
      default:
        return [];
    }
  };

  const activeFilters =
    sourceFilters ??
    (mode === "deepResearch"
      ? [...DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS]
      : [...CHAT_DEFAULT_SOURCE_FILTERS]);

  const voice = useChatVoiceTranscription({
    notebookId: (notebookId ?? null) as Id<"notebooks"> | null,
    disabled: Boolean(disabled) || !onAppendTranscription,
    onTranscribed: (text) => {
      onAppendTranscription?.(text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (message) => onVoiceError?.(message) ?? console.error(message),
  });

  const currentModel = findSmartModelById(chatSettings?.smartModel);
  const modeMeta = COMPOSER_MODES.find((m) => m.id === mode) ?? COMPOSER_MODES[0];
  const ModeIcon = modeMeta.icon;

  const showResearchDatabases =
    Boolean(notebookId) &&
    (mode === "literatureReview" ||
      ((mode === "chat" || mode === "deepResearch") && activeFilters.includes("academic")));
  const showSourceChannelFilters =
    Boolean(onSourceFilterChange) && (mode === "chat" || mode === "deepResearch");
  const showLiteratureAcademicFilters =
    mode === "literatureReview" && Boolean(onAcademicDiscoveryFiltersChange);
  const academicFiltersActive =
    Object.keys(buildAcademicDiscoveryApiFilters(academicDiscoveryFilters ?? {})).length > 0;
  const showModelRow = Boolean(onModelChange);
  const toolbarControlCount =
    1 +
    (showResearchDatabases ? 1 : 0) +
    (showLiteratureAcademicFilters ? 1 : 0) +
    (showSourceChannelFilters ? 1 : 0);
  /** Icon-only model control when the left toolbar is crowded (e.g. literature review). */
  const hideModelButtonLabel = toolbarControlCount >= 3;

  const placeholder =
    mode === "literatureReview"
      ? "Describe the topic, research question, and requirements to generate a literature review..."
      : mode === "deepResearch"
        ? "Ask a complex research question with multi-step investigation..."
        : "Ask a question about your sources...";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [value]);

  useEffect(() => {
    if (openMenu === "none") return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const refs = menuInteractionRefs(openMenu);
      if (refs.some((ref) => ref.current?.contains(target))) return;
      setOpenMenu("none");
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu("none");
    };

    const timeoutId = window.setTimeout(() => {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!showResearchDatabases && openMenu === "corpus") {
      setOpenMenu("none");
    }
  }, [showResearchDatabases, openMenu]);

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

  const filtersButtonClass = (hasActiveFilters: boolean) =>
    [
      "inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium font-sans transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      hasActiveFilters
        ? "text-primary hover:bg-muted/50"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
    ].join(" ");

  const dbMeta = RESEARCH_DATABASES.find((d) => d.id === researchDatabase) ?? RESEARCH_DATABASES[0];
  const DbButtonIcon = dbMeta.icon;

  return (
    <div className="flex w-full min-w-0 max-w-3xl flex-col items-stretch gap-3 xl:max-w-4xl 2xl:max-w-5xl">
      <div
        ref={shellRef}
        data-onboarding="chat-input"
        className="@container/chat-input pointer-events-auto relative flex w-full min-w-0 flex-col gap-0.5 overflow-visible rounded-2xl border border-border/80 bg-card px-3 py-1.5 shadow-lg"
      >
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent border-none py-1.5 px-1 resize-none outline-none text-foreground placeholder:text-muted-foreground/70 min-h-[40px] max-h-[160px] font-serif text-sm leading-relaxed"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />

        <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden">
            {/* Mode */}
            <div className="relative">
              <button
                ref={modeAnchorRef}
                type="button"
                disabled={Boolean(disabled)}
                aria-haspopup="listbox"
                aria-expanded={openMenu === "mode"}
                aria-label={`Composer mode: ${modeMeta.label}`}
                onClick={() => setOpenMenu((o) => (o === "mode" ? "none" : "mode"))}
                className={[
                  "inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-full border border-transparent px-3 text-sm font-medium font-sans transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  mode === "literatureReview"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 text-foreground hover:bg-muted/80",
                ].join(" ")}
              >
                <ModeIcon className="size-4 shrink-0 opacity-90" aria-hidden />
                <span className="min-w-0 truncate">{modeMeta.label}</span>
                <ChevronDown
                  className="size-3.5 shrink-0 opacity-60"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </button>
              <ComposerDropUp
                anchorRef={modeAnchorRef}
                open={openMenu === "mode"}
                panelRef={modePanelRef}
                className="w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-border bg-card py-2 shadow-xl font-sans animate-in fade-in slide-in-from-bottom-2 duration-150"
                role="listbox"
                aria-label="Choose chat mode"
              >
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Mode
                  </p>
                  {COMPOSER_MODES.map(({ id, label, icon: Icon }) => {
                    const active = mode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={[
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                          active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/70",
                        ].join(" ")}
                        onClick={() => {
                          onModeChange(id);
                          setOpenMenu("none");
                        }}
                      >
                        <Icon className="size-4 shrink-0 opacity-90" />
                        <span className="flex-1 min-w-0">{label}</span>
                        {active ? <Check className="size-3.5 shrink-0" strokeWidth={2.5} /> : null}
                      </button>
                    );
                  })}
              </ComposerDropUp>
            </div>

            {/* Research paper corpus: literature review always; chat/deep research when Academic filter is on */}
            {showResearchDatabases && (
              <div className="relative">
                <button
                  ref={corpusAnchorRef}
                  type="button"
                  disabled={Boolean(disabled)}
                  aria-haspopup="listbox"
                  aria-expanded={openMenu === "corpus"}
                  aria-label="Research databases"
                  onClick={() => setOpenMenu((o) => (o === "corpus" ? "none" : "corpus"))}
                  className="inline-flex h-9 max-w-[min(13rem,52vw)] min-w-0 items-center gap-2 rounded-full bg-muted/50 px-3 text-sm font-medium font-sans text-foreground hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50"
                >
                  <DbButtonIcon className="size-4 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 truncate">{dbMeta.title}</span>
                  <ChevronDown
                    className="size-3.5 shrink-0 opacity-60"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
                <ComposerDropUp
                  anchorRef={corpusAnchorRef}
                  open={openMenu === "corpus"}
                  panelRef={corpusPanelRef}
                  className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border/80 bg-popover py-3 font-sans text-popover-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  role="listbox"
                  aria-label="Choose research database"
                >
                    <p className="px-3 pb-2.5 text-sm font-medium text-muted-foreground">
                      Research Databases:
                    </p>
                    <div className="flex flex-col gap-0.5 px-1.5">
                      {RESEARCH_DATABASES.map(({ id, title, description, icon: Icon }) => {
                        const selected = researchDatabase === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={[
                              "grid w-full grid-cols-[auto_auto_1fr] grid-rows-[auto_auto] items-start gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors",
                              selected ? "bg-primary/5" : "hover:bg-muted/60",
                            ].join(" ")}
                            onClick={() => {
                              onResearchDatabaseChange(id);
                              setOpenMenu("none");
                            }}
                          >
                            <span
                              className={[
                                "col-start-1 row-span-2 row-start-1 flex size-4 shrink-0 items-center justify-center justify-self-center self-center rounded-full border-2",
                                selected
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/35 bg-transparent",
                              ].join(" ")}
                              aria-hidden
                            >
                              {selected ? (
                                <span className="size-1.5 rounded-full bg-primary-foreground" />
                              ) : null}
                            </span>
                            <Icon
                              className="col-start-2 row-span-2 row-start-1 size-4 shrink-0 self-center text-foreground/85"
                              aria-hidden
                            />
                            <span className="col-start-3 row-start-1 min-w-0 font-semibold leading-tight text-foreground">
                              {title}
                            </span>
                            <span className="col-start-3 row-start-2 min-w-0 text-xs font-normal leading-snug text-muted-foreground">
                              {description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                </ComposerDropUp>
              </div>
            )}

            {/* Literature review: academic paper filters */}
            {showLiteratureAcademicFilters && (
              <div className="relative">
                <button
                  ref={filtersAnchorRef}
                  type="button"
                  disabled={Boolean(disabled)}
                  aria-expanded={openMenu === "filters"}
                  aria-label="Filters"
                  onClick={() => setOpenMenu((o) => (o === "filters" ? "none" : "filters"))}
                  className={filtersButtonClass(academicFiltersActive)}
                >
                  <ListFilter className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                  Filters
                </button>
                <ComposerDropUp
                  anchorRef={filtersAnchorRef}
                  open={openMenu === "filters"}
                  panelRef={filtersPanelRef}
                  className="max-h-[min(65vh,480px)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card p-3 shadow-xl font-sans animate-in fade-in slide-in-from-bottom-2 duration-150"
                >
                    <AcademicDiscoveryFiltersSection
                      academic={academicDiscoveryFilters ?? {}}
                      setAcademic={onAcademicDiscoveryFiltersChange!}
                      showTopDivider={false}
                    />
                </ComposerDropUp>
              </div>
            )}

            {/* Chat / deep research: source channels + academic filters */}
            {showSourceChannelFilters && (
              <div className="relative">
                <button
                  ref={filtersAnchorRef}
                  type="button"
                  disabled={Boolean(disabled)}
                  aria-expanded={openMenu === "filters"}
                  aria-label="Filters"
                  onClick={() => setOpenMenu((o) => (o === "filters" ? "none" : "filters"))}
                  className={filtersButtonClass(
                    activeFilters.includes("academic") && academicFiltersActive
                  )}
                >
                  <ListFilter className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                  Filters
                </button>
                <ComposerDropUp
                  anchorRef={filtersAnchorRef}
                  open={openMenu === "filters"}
                  panelRef={filtersPanelRef}
                  className="max-h-[min(65vh,480px)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card p-3 shadow-xl font-sans animate-in fade-in slide-in-from-bottom-2 duration-150"
                >
                    <p className="text-xs font-semibold text-foreground">Source channels</p>
                    <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                      {SOURCE_FILTERS.map(({ id, label, icon: Icon }) => {
                        const isActive = activeFilters.includes(id);
                        return (
                          <label
                            key={id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm select-none transition-colors ${
                              isActive
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="flex-1 min-w-0">{label}</span>
                            <input
                              type="checkbox"
                              checked={isActive}
                              disabled={!onSourceFilterChange}
                              onChange={() => toggleFilter(id)}
                              className="h-4 w-4 shrink-0 rounded border-2 border-border bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                            />
                          </label>
                        );
                      })}
                    </div>
                    {activeFilters.includes("academic") && onAcademicDiscoveryFiltersChange && (
                      <AcademicDiscoveryFiltersSection
                        academic={academicDiscoveryFilters ?? {}}
                        setAcademic={onAcademicDiscoveryFiltersChange}
                      />
                    )}
                </ComposerDropUp>
              </div>
            )}
          </div>

          <div className="flex min-h-9 min-w-0 shrink-0 flex-nowrap items-center justify-end gap-2 pl-1">
            {showModelRow && (
              <div className="relative max-w-full min-w-0">
                <button
                  ref={modelAnchorRef}
                  type="button"
                  onClick={() => setOpenMenu((o) => (o === "model" ? "none" : "model"))}
                  disabled={Boolean(disabled)}
                  aria-expanded={openMenu === "model"}
                  aria-haspopup="listbox"
                  className={cn(
                    "group h-9 max-w-full min-w-0 inline-flex shrink-0 items-center rounded-lg border border-transparent bg-transparent font-sans text-sm font-medium tabular-nums text-muted-foreground",
                    "transition-[color,background-color,transform] duration-150",
                    "hover:bg-muted/45 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    hideModelButtonLabel ? "gap-1 px-1.5" : "gap-1.5 px-1.5",
                    openMenu === "model" && "bg-muted/40 text-foreground"
                  )}
                  title={currentModel?.name ?? "Choose model"}
                  aria-label={`Model: ${currentModel?.name ?? "Choose model"}`}
                >
                  <ModelBrandIcon brand={currentModel?.brand ?? "openai"} />
                  <span
                    className={cn(
                      "min-w-0 max-w-36 truncate",
                      hideModelButtonLabel ? "sr-only" : "@max-4xl/chat-input:sr-only"
                    )}
                  >
                    {currentModel?.name ?? "GPT-OSS 120B"}
                  </span>
                  <ChevronDown
                    className={[
                      "size-3.5 shrink-0 opacity-50 transition-transform duration-200",
                      "group-hover:opacity-70",
                      openMenu === "model" && "-rotate-180 opacity-70",
                    ].join(" ")}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
                {onModelChange && (
                  <ComposerDropUp
                    anchorRef={modelAnchorRef}
                    open={openMenu === "model"}
                    align="right"
                    panelRef={modelPanelRef}
                    className="min-w-[13.5rem] max-w-[min(18rem,calc(100vw-2rem))] max-h-[min(70vh,22rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-border/80 bg-popover py-1 font-sans text-popover-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-150"
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
                              setOpenMenu("none");
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
                  </ComposerDropUp>
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
              disabled={!isStreaming && (!value.trim() || disabled || !notebookId)}
              className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg p-0 transition-all shadow-md active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
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
                      ? mode === "literatureReview"
                        ? "Start literature review (Enter)"
                        : mode === "deepResearch"
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
              ) : mode === "literatureReview" || mode === "deepResearch" ? (
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
