import type { Id } from "@convex/_generated/dataModel";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { DiscoveryAcademicFilterState } from "@/features/sources/components/AcademicDiscoveryFiltersSection";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/shared/components/ui/input-group";
import type { ChatSettings } from "@/shared/types";
import { useChatVoiceTranscription } from "../hooks/useChatVoiceTranscription";
import {
  CHAT_DEFAULT_SOURCE_FILTERS,
  type ChatComposerMode,
  DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS,
  type ResearchDatabaseOption,
  type SourceFilterId,
} from "./composer/constants";
import { FiltersPopover } from "./composer/FiltersPopover";
import { ModelMenu } from "./composer/ModelMenu";
import { ModeMenu } from "./composer/ModeMenu";
import { ResearchDatabaseMenu } from "./composer/ResearchDatabaseMenu";
import { SendButton } from "./composer/SendButton";
import { VoiceButton } from "./composer/VoiceButton";

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
  sourceFilters?: SourceFilterId[];
  onSourceFilterChange?: (filters: SourceFilterId[]) => void;
  /** Academic sub-filters when the Academic channel is enabled (persisted in session). */
  academicDiscoveryFilters?: DiscoveryAcademicFilterState;
  onAcademicDiscoveryFiltersChange?: (patch: Partial<DiscoveryAcademicFilterState>) => void;
  chatSettings?: ChatSettings;
  onModelChange?: (modelId: string) => void;
}

const PLACEHOLDERS: Record<ChatComposerMode, string> = {
  chat: "Ask a question about your sources...",
  deepResearch: "Ask a complex research question with multi-step investigation...",
  literatureReview:
    "Describe the topic, research question, and requirements to generate a literature review...",
};

/** keyCode 229 marks keys handled by an IME (older Safari doesn't set `isComposing`). */
const IME_KEY_CODE = 229;

/**
 * The textarea auto-grows with `field-sizing: content`. iOS WKWebView before 26.2 lacks it, so there
 * the height is fitted by hand. jsdom has no `CSS.supports`; treat that as supported.
 */
function lacksFieldSizing(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    !CSS.supports("field-sizing", "content")
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
  const isDisabled = Boolean(disabled);

  const activeFilters: readonly SourceFilterId[] =
    sourceFilters ??
    (mode === "deepResearch" ? DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS : CHAT_DEFAULT_SOURCE_FILTERS);
  const placeholder = PLACEHOLDERS[mode];

  const voice = useChatVoiceTranscription({
    notebookId: (notebookId ?? null) as Id<"notebooks"> | null,
    disabled: isDisabled || !onAppendTranscription,
    onTranscribed: (text) => {
      onAppendTranscription?.(text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (message) => onVoiceError?.(message) ?? console.error(message),
  });

  const showResearchDatabases =
    Boolean(notebookId) &&
    (mode === "literatureReview" ||
      ((mode === "chat" || mode === "deepResearch") && activeFilters.includes("academic")));
  const showSourceChannelFilters =
    Boolean(onSourceFilterChange) && (mode === "chat" || mode === "deepResearch");
  const showLiteratureAcademicFilters =
    mode === "literatureReview" && Boolean(onAcademicDiscoveryFiltersChange);
  const toolbarControlCount =
    1 +
    (showResearchDatabases ? 1 : 0) +
    (showLiteratureAcademicFilters ? 1 : 0) +
    (showSourceChannelFilters ? 1 : 0);
  /** Icon-only model control when the left toolbar is crowded (e.g. literature review). */
  const hideModelButtonLabel = toolbarControlCount >= 3;

  /** Fallback auto-grow: fit the height to the content, capped by the CSS `max-height`. */
  const fitTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const max = Number.parseFloat(getComputedStyle(el).maxHeight);
    // Collapse first so scrollHeight shrinks when text is deleted.
    el.style.height = "0px";
    const content = el.scrollHeight;
    el.style.height = `${Number.isFinite(max) ? Math.min(content, max) : content}px`;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fit when the text or placeholder changes
  useLayoutEffect(() => {
    if (lacksFieldSizing()) fitTextareaHeight();
  }, [value, placeholder, fitTextareaHeight]);

  // Wrapping depends on width, so re-fit when the composer is resized.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !lacksFieldSizing() || typeof ResizeObserver === "undefined") return;
    let lastWidth = -1;
    const observer = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width === lastWidth) return;
      lastWidth = width;
      fitTextareaHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitTextareaHeight]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      // Enter that confirms an IME candidate (CJK input) must not send.
      if (e.nativeEvent.isComposing || e.keyCode === IME_KEY_CODE) return;
      e.preventDefault();
      onSend();
    },
    [onSend]
  );

  return (
    <div className="flex w-full min-w-0 max-w-3xl flex-col items-stretch gap-3 xl:max-w-4xl 2xl:max-w-5xl">
      {/* Labels collapse by the composer's own width (container queries), not the viewport: in the
          tablet three-panel layout the chat column is narrower than a phone screen. */}
      <InputGroup
        variant="composer"
        size="auto"
        data-onboarding="chat-input"
        className="@container/chat-input pointer-events-auto"
      >
        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          enterKeyHint="send"
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-12"
        />
        {/* Wraps the right cluster onto its own line only if the controls can't fit at all. */}
        <InputGroupAddon align="block-end" className="flex-wrap justify-between">
          <div className="flex min-w-0 items-center gap-1">
            <ModeMenu
              mode={mode}
              onModeChange={onModeChange}
              disabled={isDisabled}
              crowded={showResearchDatabases}
            />
            {/* Literature review always; chat / deep research while the Academic channel is on. */}
            {showResearchDatabases ? (
              <ResearchDatabaseMenu
                value={researchDatabase}
                onChange={onResearchDatabaseChange}
                disabled={isDisabled}
              />
            ) : null}
            {showSourceChannelFilters || showLiteratureAcademicFilters ? (
              <FiltersPopover
                mode={mode}
                sourceFilters={activeFilters}
                onSourceFilterChange={onSourceFilterChange}
                academicDiscoveryFilters={academicDiscoveryFilters}
                onAcademicDiscoveryFiltersChange={onAcademicDiscoveryFiltersChange}
                disabled={isDisabled}
              />
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {onModelChange ? (
              <ModelMenu
                value={chatSettings?.smartModel}
                onModelChange={onModelChange}
                disabled={isDisabled}
                hideLabel={hideModelButtonLabel}
              />
            ) : null}
            {onAppendTranscription ? (
              <VoiceButton
                voiceState={voice.voiceState}
                formatElapsed={voice.formatElapsed}
                toggleRecording={voice.toggleRecording}
                disabled={isDisabled || !notebookId}
              />
            ) : null}
            <SendButton
              mode={mode}
              hasText={value.trim().length > 0}
              isStreaming={isStreaming}
              disabled={isDisabled}
              waitingOnRemoteGeneration={waitingOnRemoteGeneration}
              blocked={!notebookId}
              onSend={onSend}
              onStop={onStop}
            />
          </div>
        </InputGroupAddon>
      </InputGroup>
      <p className="pointer-events-none px-1 text-center font-sans text-xs leading-snug text-muted-foreground">
        SolomindLM can be inaccurate; please double check its responses.
      </p>
    </div>
  );
};
