import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { Message, MentionedSource, ChatSettings, ReferenceChunk } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/useToast";
import { useChatStreamingContext } from "../useChatStreaming";
import { useSourcesContext } from "../../sources/useSourcesContext";
import { useSelectionQuotes } from "../contexts/SelectionQuoteContext";
import { getDocumentIdsFromMentions, prependAttachedSourceMentionsToMessage } from "../utils/mentions";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useReferenceTooltip } from "./useReferenceTooltip";
import { useChatActions } from "./useChatActions";
import { useConversationPinning } from "./useConversationPinning";
import { useResearchPlanActions } from "./useResearchPlanActions";
import { RefHandlers } from "../utils/messageRendering.utils";
import { AcademicFilterState } from "@/features/sources/components/AcademicFilters.types";
import { DEFAULT_ACADEMIC_FILTERS } from "@/features/sources/components/AcademicFilters.utils";

/** Tailwind `bottom-3` on the floating composer wrapper */
const CHAT_COMPOSER_BOTTOM_INSET_PX = 12;
/** Extra scroll past last message so content isn't hidden under the composer */
const CHAT_COMPOSER_SCROLL_END_GAP_PX = 16;
/** Floor so short composers still clear the old fixed footer (~md:h-56) */
const CHAT_COMPOSER_SCROLL_PADDING_MIN_PX = 240;

interface UseChatPanelOptions {
  notebookId?: string | null;
  notebookTitle: string;
  onOpenNotebookSource?: (documentId: string) => void;
}

export function useChatPanel(options: UseChatPanelOptions) {
  const { notebookId, notebookTitle, onOpenNotebookSource } = options;

  const {
    messages,
    isChatStreaming: isLoading,
    remoteGenerationBlocksSend,
    onSendMessage,
    onStopChat,
    onSetFeedback,
    onRetry,
    onSaveChatOptimistic,
    sourceCount,
    sourceSummary,
    suggestions,
    isLoadingSuggestions,
    activeConversationId,
    conversations,
    onSelectConversation,
    onCreateConversation,
    onRenameConversation,
    onDeleteConversation,
    consumeResearchExecuteStream,
  } = useChatStreamingContext();
  const { sources } = useSourcesContext();
  const { quotes, clearQuotes } = useSelectionQuotes();

  const [inputMessage, setInputMessage] = useState("");
  const [mentionedSources, setMentionedSources] = useState<MentionedSource[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [sourceFilters, setSourceFilters] = useState<string[]>(["notebook"]);
  const [academicFilters, setAcademicFilters] = useState<AcademicFilterState>(DEFAULT_ACADEMIC_FILTERS);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const virtuosoRef = useRef<any>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const [composerScrollPaddingPx, setComposerScrollPaddingPx] = useState(288);

  const { error: toastError } = useToast();
  const addExternalSourcesMutation = useMutation(api.documents.index.addExternalSources);

  const tooltip = useReferenceTooltip({ messagesContainerRef, messages });
  const actions = useChatActions({ notebookId, notebookTitle, messages, onSaveChatOptimistic });
  const pinning = useConversationPinning();
  const research = useResearchPlanActions();

  useLayoutEffect(() => {
    const el = composerRootRef.current;
    if (!el) return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      setComposerScrollPaddingPx(
        Math.max(
          CHAT_COMPOSER_SCROLL_PADDING_MIN_PX,
          Math.ceil(h + CHAT_COMPOSER_BOTTOM_INSET_PX + CHAT_COMPOSER_SCROLL_END_GAP_PX)
        )
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chatInputDisabled = isSending || isLoading || remoteGenerationBlocksSend;
  const waitingOnRemoteGeneration = remoteGenerationBlocksSend && !isLoading && !isSending;

  const handleNewConversation = useCallback(async () => {
    if (!onCreateConversation) return;
    setIsCreatingConversation(true);
    try {
      const id = await onCreateConversation();
      if (id) {
        onSelectConversation?.(id);
        setHistoryOpen(false);
      }
    } catch {
      toastError("Failed to create conversation");
    } finally {
      setIsCreatingConversation(false);
    }
  }, [onCreateConversation, onSelectConversation, toastError]);

  const copyMessageAsMarkdown = useCallback(async (message: Message) => {
    const stripRefs = (c: string) => {
      const m = c.match(/\n?(?:References|Reference):\s*\n?[\d\s.,\-:–—]*$/i);
      return m ? c.substring(0, m.index).trim() : c;
    };
    try {
      await navigator.clipboard.writeText(
        message.role === "assistant" ? stripRefs(message.content) : message.content
      );
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      /* clipboard API not available */
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || chatInputDisabled || !notebookId || !onSendMessage) return;

    if (!deepResearchEnabled && sourceFilters.includes("notebook")) {
      const selectedSources = sources?.filter((s) => s.selected) ?? [];
      if (selectedSources.length === 0) {
        toastError("Please select at least one source before asking a question");
        return;
      }
    }

    let messageWithQuotes = trimmed;
    if (quotes.length > 0) {
      const quoteBlocks = quotes
        .map((q) => {
          const sourceLabel = q.sourceTitle ? `From ${q.sourceTitle}:\n` : "";
          return `> ${sourceLabel}${q.text.split("\n").join("\n> ")}`;
        })
        .join("\n\n");
      messageWithQuotes = `${quoteBlocks}\n\n${trimmed}`;
      clearQuotes();
    }

    messageWithQuotes = prependAttachedSourceMentionsToMessage(messageWithQuotes, mentionedSources);

    const attachedDocumentIds = getDocumentIdsFromMentions(mentionedSources);
    const selectedIds = sources?.filter((s) => s.selected).map((s) => s.id) ?? [];

    setIsSending(true);
    setInputMessage("");
    setMentionedSources([]);
    onSendMessage(
      messageWithQuotes,
      deepResearchEnabled || undefined,
      { channels: sourceFilters },
      selectedIds,
      attachedDocumentIds,
      academicFilters
    );
    setIsSending(false);
  }, [
    inputMessage,
    chatInputDisabled,
    notebookId,
    onSendMessage,
    sources,
    toastError,
    deepResearchEnabled,
    sourceFilters,
    quotes,
    clearQuotes,
    mentionedSources,
  ]);

  const handleSendChip = useCallback(
    (text: string) => {
      if (chatInputDisabled || !notebookId || !onSendMessage) return;

      if (sourceFilters.includes("notebook")) {
        const selectedSources = sources?.filter((s) => s.selected) ?? [];
        if (selectedSources.length === 0) {
          toastError("Please select at least one source before asking a question");
          return;
        }
      }

      const attachedDocumentIds = getDocumentIdsFromMentions(mentionedSources);
      const selectedIds = sources?.filter((s) => s.selected).map((s) => s.id) ?? [];

      const messageText = prependAttachedSourceMentionsToMessage(text.trim(), mentionedSources);

      onSendMessage(messageText, undefined, { channels: sourceFilters }, selectedIds, attachedDocumentIds, academicFilters);
    },
    [
      chatInputDisabled,
      notebookId,
      onSendMessage,
      sources,
      toastError,
      sourceFilters,
      mentionedSources,
    ]
  );

  useEffect(() => {
    if (virtuosoRef.current && messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: "end",
          behavior: "smooth",
        });
      }, 100);
    }
  }, [messages.length]);

  const handleOpenReferenceInSources = useCallback(
    (reference: ReferenceChunk) => {
      const docId = reference.documentId?.trim();
      if (!docId || !onOpenNotebookSource) return;
      if (!sources.some((s) => s.id === docId)) return;
      onOpenNotebookSource(docId);
      tooltip.closeTooltip();
    },
    [onOpenNotebookSource, sources, tooltip]
  );

  const memoizedMessages = useMemo(() => messages, [messages]);

  const refHandlers: RefHandlers = useMemo(
    () => ({ onRefHover: tooltip.handleRefHover, onRefLeave: tooltip.handleRefLeave, onRefClick: tooltip.handleRefClick }),
    [tooltip]
  );

  const handleSaveChatConfig = useCallback(
    async (settings: ChatSettings, opts?: { silentSuccess?: boolean }) => {
      if (!notebookId) return;
      setIsSavingConfig(true);
      try {
        await actions.handleSaveChatConfig(settings, opts);
        setIsConfigModalOpen(false);
      } catch (_e) {
        toastError("Failed to save chat settings");
      } finally {
        setIsSavingConfig(false);
      }
    },
    [notebookId, actions, toastError]
  );

  const handleApproveResearchPlan = useCallback(
    async (planId: string) => {
      await research.handleApproveResearchPlan(planId, consumeResearchExecuteStream);
    },
    [research, consumeResearchExecuteStream]
  );

  return {
    // Context data
    messages,
    isLoading,
    onSetFeedback,
    onRetry,
    sourceCount,
    sourceSummary,
    suggestions,
    isLoadingSuggestions,
    activeConversationId,
    conversations,
    onSelectConversation,
    onRenameConversation,
    onDeleteConversation,
    onStopChat,
    sources,
    quotes,

    // Local state
    inputMessage,
    setInputMessage,
    mentionedSources,
    setMentionedSources,
    deepResearchEnabled,
    setDeepResearchEnabled,
    sourceFilters,
    setSourceFilters,
    academicFilters,
    setAcademicFilters,
    historyOpen,
    setHistoryOpen,
    isCreatingConversation,
    isConfigModalOpen,
    setIsConfigModalOpen,
    isSavingConfig,
    chatInputDisabled,
    waitingOnRemoteGeneration,
    copiedMessageId,

    // Refs
    messagesContainerRef,
    virtuosoRef,
    composerRootRef,
    composerScrollPaddingPx,

    // Hooks
    tooltip,
    actions,
    pinning,
    research,
    addExternalSourcesMutation,
    toastError,

    // Handlers
    handleNewConversation,
    copyMessageAsMarkdown,
    handleSendMessage,
    handleSendChip,
    handleOpenReferenceInSources,
    memoizedMessages,
    refHandlers,
    handleSaveChatConfig,
    handleApproveResearchPlan,
  };
}
