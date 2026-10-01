import type { Id } from "@convex/_generated/dataModel";
import {
  Download,
  FileText,
  History,
  MessageCircle,
  MoreVertical,
  PanelLeftOpen,
  PanelRightOpen,
  Pin,
  Plus,
  Settings2,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useHttpAuthToken } from "@/features/auth/hooks/useHttpAuthToken";
import {
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "@/features/sources/components/AcademicDiscoveryFiltersSection";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { useToast } from "@/shared/contexts/useToast";
import { ChatSettings, Message, Note, ReferenceChunk } from "@/shared/types/index";
import { useUpdateNotebook } from "../../notebooks/services/notebooksApi";
import { useAddExternalSources } from "../../sources/services/documentsApi";
import { useSourcesContext } from "../../sources/useSourcesContext";
import type { ChatStreamSourcePolicy } from "../chatStreamTypes";
import { useComposerClearance } from "../hooks/useComposerClearance";
import { usePersistedComposerPrefs } from "../hooks/usePersistedComposerPrefs";
import { useStartLiteratureReview } from "../hooks/useStartLiteratureReview";
import { CONVEX_SITE_URL } from "../services/chatApi";
import { useLiteratureReviewSession } from "../services/literatureReviewApi";
import { useApproveResearchPlan, useRejectResearchPlan } from "../services/researchApi";
import { useSaveChat } from "../services/userNotesApi";
import { useChatStreamingContext } from "../useChatStreaming";
import { exportAsMarkdown } from "../utils/exportChat";
import { RefHandlers, stripReferencesSection } from "../utils/messageRendering.utils";
import { ChatEmptyState } from "./ChatEmptyState";
import {
  CHAT_DEFAULT_SOURCE_FILTERS,
  type ChatComposerMode,
  ChatInput,
  DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS,
} from "./ChatInput";
import { ConfigureChatModal } from "./ConfigureChatModal";
import { ConversationList } from "./ConversationList";
import { LiteratureReviewMessage } from "./LiteratureReviewMessage";
import { MessageBubble } from "./MessageBubble";
import { ReferenceTooltip } from "./ReferenceTooltip";
import { ResearchPlanMessage } from "./ResearchPlanMessage";

/**
 * Spacer below the last message so it can scroll clear of the floating composer. Its height
 * tracks the composer's rendered height via `useComposerClearance` (fallback until measured).
 */
const MessageListFooter = () => (
  <div
    className="h-[var(--chat-composer-clearance,18rem)] shrink-0 md:h-[var(--chat-composer-clearance,14rem)]"
    aria-hidden
  />
);
const MESSAGE_LIST_COMPONENTS = { Footer: MessageListFooter };

/**
 * Opens a header tooltip only for keyboard focus. Popover and DropdownMenu hand focus back to their trigger
 * when they close; without this the tooltip would pop open then (and stick on touch). Radix skips its own
 * focus handler when the event is default-prevented.
 */
const openTooltipOnFocusVisibleOnly = (e: React.FocusEvent<HTMLElement>) => {
  if (!e.currentTarget.matches(":focus-visible")) e.preventDefault();
};

/** Hover/focus label for a header icon button. `children` is the trigger (a Button, or a Popover/DropdownMenu trigger around one). */
function HeaderTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild onFocus={openTooltipOnFocusVisibleOnly}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Escape in a thread's rename input cancels only the rename (ConversationList handles it), not the history popover. */
const keepHistoryOpenOnRenameEscape = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement | null)?.closest?.("[data-rename-input]")) e.preventDefault();
};

interface ChatPanelProps {
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  notebookId?: Id<"notebooks"> | null;
  notebookTitle?: string;
  notebookIcon?: string | null;
  notebookCoverColor?: string | null;
  chatSettings?: ChatSettings;
  /** Open a notebook document in the sources panel (citation / reference tooltip) */
  onOpenNotebookSource?: (documentId: string) => void;
  onOpenLiteratureTable?: (tableId: Id<"literatureTables">) => void;
  onOpenLiteratureReport?: (reportId: Id<"literatureReports">) => void;
  onOpenRankedPapers?: (sessionId: Id<"literatureReviewSessions">) => void;
  onOpenScreeningDecisions?: (sessionId: Id<"literatureReviewSessions">) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isLeftOpen,
  isRightOpen,
  toggleLeft,
  toggleRight,
  notebookId,
  notebookTitle = "Chat",
  notebookIcon,
  notebookCoverColor,
  chatSettings,
  onOpenNotebookSource,
  onOpenLiteratureTable,
  onOpenLiteratureReport,
  onOpenRankedPapers,
  onOpenScreeningDecisions,
}) => {
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
  const notebookDocumentIds = useMemo(() => new Set(sources.map((s) => s.id)), [sources]);
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<"top" | "bottom">("top");
  const [tooltipStyle, setTooltipStyle] = useState<{ top?: number; left?: number }>({});
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const {
    composerMode,
    setComposerMode,
    sourceFilters,
    setSourceFilters,
    researchDatabase,
    setResearchDatabase,
  } = usePersistedComposerPrefs(notebookId);
  const [activeLiteratureSessionId, setActiveLiteratureSessionId] =
    useState<Id<"literatureReviewSessions"> | null>(null);
  const [chatAcademicFilters, setChatAcademicFilters] =
    useSessionStorage<DiscoveryAcademicFilterState>("chat-academic-filters", {});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const updateNotebook = useUpdateNotebook();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("chat-pinned-ids");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  /** Chat / deep research: PubMed or arXiv corpus implies academic web search; literature workflow ignores this. */
  const channelsForChatSend = useMemo(() => {
    if (composerMode === "literatureReview") return sourceFilters;
    const ch = [...sourceFilters];
    if (researchDatabase === "pubmed" || researchDatabase === "arxiv") {
      if (!ch.includes("academic")) ch.push("academic");
    }
    return ch;
  }, [composerMode, sourceFilters, researchDatabase]);

  const chatSourcePolicy = useMemo((): ChatStreamSourcePolicy => {
    const policy: ChatStreamSourcePolicy = { channels: channelsForChatSend };
    if (composerMode === "deepResearch") {
      policy.maxResultsPerChannel = 8;
    }
    if (channelsForChatSend.includes("academic")) {
      const api = buildAcademicDiscoveryApiFilters(chatAcademicFilters);
      if (Object.keys(api).length > 0) {
        policy.academicFilters = api;
      }
      if (researchDatabase === "pubmed") {
        policy.academicSources = ["pubmed"];
      } else if (researchDatabase === "arxiv") {
        policy.academicSources = ["arxiv"];
      }
    }
    return policy;
  }, [channelsForChatSend, chatAcademicFilters, composerMode, researchDatabase]);

  const { success, error: toastError } = useToast();
  const saveChat = useSaveChat();

  const authToken = useHttpAuthToken();

  const handleTogglePin = useCallback((convId: string) => {
    const id = String(convId);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("chat-pinned-ids", JSON.stringify([...next]));
      } catch {
        // localStorage may be unavailable in some environments
      }
      return next;
    });
  }, []);

  const handlePinActiveChat = useCallback(() => {
    if (!activeConversationId) return;
    handleTogglePin(activeConversationId);
  }, [activeConversationId, handleTogglePin]);

  const approvePlanMutation = useApproveResearchPlan();
  const rejectPlanMutation = useRejectResearchPlan();
  const addExternalSourcesMutation = useAddExternalSources();
  const { startLiteratureReview, isStarting: isStartingLiteratureReview } =
    useStartLiteratureReview();

  const handleApproveResearchPlan = useCallback(
    async (planId: Id<"researchPlans">) => {
      try {
        await approvePlanMutation({ planId });
        const response = await fetch(`${CONVEX_SITE_URL}/research/execute`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ planId }),
        });
        if (!response.ok) {
          if (response.status === 404) {
            toastError("Research is starting. Please retry in a moment.");
            return;
          }
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || `Research failed to start (${response.status})`);
        }
        await consumeResearchExecuteStream(response);
      } catch (err) {
        console.error("[ResearchPlan] Approve failed:", err);
        toastError(err instanceof Error ? err.message : "Failed to start research execution");
      }
    },
    [approvePlanMutation, authToken, consumeResearchExecuteStream, toastError]
  );

  const handleRejectResearchPlan = useCallback(
    async (planId: Id<"researchPlans">) => {
      try {
        await rejectPlanMutation({ planId });
      } catch (err) {
        console.error("[ResearchPlan] Reject failed:", err);
      }
    },
    [rejectPlanMutation]
  );

  const chatInputDisabled = isSending || isLoading || remoteGenerationBlocksSend;
  const waitingOnRemoteGeneration = remoteGenerationBlocksSend && !isLoading && !isSending;

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const virtuosoRef = useRef<any>(null);
  const messageScrollerRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  useComposerClearance(messagesContainerRef, composerRef, messageScrollerRef);
  const setMessageScroller = useCallback((el: unknown) => {
    messageScrollerRef.current = el instanceof HTMLElement ? el : null;
  }, []);

  // --- Chat action handlers ---

  const handleExportChat = () => {
    if (messages.length === 0) {
      toastError("No messages to export");
      return;
    }
    exportAsMarkdown(messages, notebookTitle);
    success("Chat exported successfully");
  };

  const handleSaveToNote = async () => {
    if (messages.length === 0) {
      toastError("No messages to save");
      return;
    }
    if (!notebookId) {
      toastError("No notebook selected");
      return;
    }

    const placeholderNote: Note = {
      id: `pending-save-${Date.now()}`,
      title: "Saved chat",
      preview: "Note · Saved Chat",
      type: "note",
      noteType: "chat",
      status: "generating",
      content: undefined,
      messages: [],
      metadata: { messageCount: messages.length, savedAt: new Date().toISOString() },
    };
    onSaveChatOptimistic?.({ notebookId, note: placeholderNote });
    try {
      const serializedMessages = messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp,
      }));
      await saveChat({ notebookId, messages: serializedMessages, messageCount: messages.length });
    } catch (error) {
      console.error("Failed to save chat:", error);
    } finally {
      onSaveChatOptimistic?.(null);
    }
  };

  const handleSaveChatConfig = useCallback(
    async (settings: ChatSettings, opts?: { silentSuccess?: boolean }) => {
      if (!notebookId) return;
      setIsSavingConfig(true);
      try {
        await updateNotebook(notebookId, { chatSettings: settings });
        if (!opts?.silentSuccess) {
          success("Chat settings saved");
        }
        setIsConfigModalOpen(false);
      } catch (_e) {
        toastError("Failed to save chat settings");
      } finally {
        setIsSavingConfig(false);
      }
    },
    [notebookId, updateNotebook, success, toastError]
  );

  // --- Tooltip / citation handlers ---

  const closeTooltip = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    setHoveredRefId(null);
    setHoveredMessageId(null);
    setIsTooltipHovered(false);
  }, []);

  const handleRefEnter = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
  }, []);

  const handleRefLeave = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    hideTooltipTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) {
        setHoveredRefId(null);
        setHoveredMessageId(null);
      }
    }, 150);
  }, [isTooltipHovered]);

  const handleRefHover = useCallback(
    (refId: number, messageId: string, event: React.MouseEvent) => {
      handleRefEnter();
      setHoveredRefId(refId);
      setHoveredMessageId(messageId);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const containerRect = messagesContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const position =
        rect.top - containerRect.top > containerRect.bottom - rect.bottom ? "top" : "bottom";
      setTooltipPosition(position);
      const refCenterX = rect.left - containerRect.left + rect.width / 2;
      const refCenterY = rect.top - containerRect.top;
      setTooltipStyle(
        position === "top"
          ? { left: refCenterX, top: refCenterY - 2 }
          : { left: refCenterX, top: refCenterY + rect.height + 2 }
      );
    },
    [handleRefEnter]
  );

  const handleRefClick = useCallback(
    (refId: number, messageId: string, event: React.MouseEvent | React.TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
      if (hoveredRefId === refId && hoveredMessageId === messageId) {
        setHoveredRefId(null);
        setHoveredMessageId(null);
      } else {
        handleRefHover(refId, messageId, event as React.MouseEvent);
      }
    },
    [hoveredRefId, hoveredMessageId, handleRefHover]
  );

  useEffect(() => {
    if (!hoveredRefId) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (tooltipRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement)?.closest('span[title^="Reference"]')) return;
      closeTooltip();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [hoveredRefId, closeTooltip]);

  const refHandlers: RefHandlers = useMemo(
    () => ({ onRefHover: handleRefHover, onRefLeave: handleRefLeave, onRefClick: handleRefClick }),
    [handleRefHover, handleRefLeave, handleRefClick]
  );

  const handleNewConversation = useCallback(async () => {
    if (!onCreateConversation) return;

    // Already on an empty thread — avoid creating duplicate blank conversations.
    if (messages.length === 0) {
      setActiveLiteratureSessionId(null);
      setComposerMode("chat");
      closeTooltip();
      setHistoryOpen(false);
      return;
    }

    setIsCreatingConversation(true);
    try {
      const id = await onCreateConversation();
      if (id) {
        // New thread has no messages; stale session ids would keep showing the literature review
        // (or research overlays) from the previous conversation instead of a fresh empty chat.
        setActiveLiteratureSessionId(null);
        setComposerMode("chat");
        setInputMessage("");
        closeTooltip();
        onSelectConversation?.(id);
        setHistoryOpen(false);
      } else {
        toastError(
          "Could not start a new chat. Wait for the notebook to finish loading, then try again."
        );
      }
    } catch {
      toastError("Failed to create conversation");
    } finally {
      setIsCreatingConversation(false);
    }
  }, [
    messages.length,
    onCreateConversation,
    onSelectConversation,
    toastError,
    closeTooltip,
    setComposerMode,
  ]);

  // --- Message handlers ---

  const copyMessageAsMarkdown = useCallback(async (message: Message) => {
    try {
      await navigator.clipboard.writeText(
        message.role === "assistant" ? stripReferencesSection(message.content) : message.content
      );
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      /* clipboard API not available */
    }
  }, []);

  const validateNotebookSourcesForSend = useCallback(() => {
    if (composerMode === "literatureReview") return true;
    if (!channelsForChatSend.includes("notebook")) return true;
    const completed = sources?.filter((s) => s.status === "completed") ?? [];
    const selectedCompleted = completed.filter((s) => s.selected);
    if (selectedCompleted.length === 0) {
      toastError("Please select at least one source before asking a question");
      return false;
    }
    return true;
  }, [composerMode, channelsForChatSend, sources, toastError]);

  const handleComposerModeChange = useCallback(
    (next: ChatComposerMode) => {
      if (composerMode === "literatureReview" && next !== "literatureReview") {
        setActiveLiteratureSessionId(null);
      }
      if (next === "deepResearch") {
        setSourceFilters((prev) => {
          const merged = new Set([...prev, ...DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS]);
          return [...merged];
        });
      } else if (next === "chat") {
        setSourceFilters([...CHAT_DEFAULT_SOURCE_FILTERS]);
      }
      setComposerMode(next);
    },
    [composerMode, setSourceFilters, setComposerMode]
  );

  const handleSendMessage = useCallback(async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || chatInputDisabled || !notebookId || !onSendMessage) return;

    if (!validateNotebookSourcesForSend()) return;

    setIsSending(true);
    setInputMessage("");

    if (composerMode === "literatureReview") {
      try {
        let conversationId = activeConversationId ?? undefined;
        if (messages.length > 0 && onCreateConversation) {
          const newId = await onCreateConversation();
          if (newId) {
            conversationId = newId as Id<"conversations">;
            onSelectConversation?.(conversationId);
          }
        }

        const api = buildAcademicDiscoveryApiFilters(chatAcademicFilters);
        const { sessionId, conversationId: reviewConversationId } = await startLiteratureReview(
          trimmed,
          notebookId as Id<"notebooks">,
          {
            researchDatabase,
            ...(Object.keys(api).length > 0 ? { academicFilters: api } : {}),
          },
          conversationId,
          chatSettings?.smartModel
        );
        if (reviewConversationId !== activeConversationId) {
          onSelectConversation?.(reviewConversationId);
        }
        setActiveLiteratureSessionId(sessionId);
      } catch {
        toastError("Failed to start literature review. Please try again.");
      }
    } else {
      onSendMessage(trimmed, composerMode === "deepResearch" ? true : undefined, chatSourcePolicy);
    }

    setIsSending(false);
  }, [
    inputMessage,
    chatInputDisabled,
    notebookId,
    onSendMessage,
    toastError,
    composerMode,
    chatSourcePolicy,
    startLiteratureReview,
    validateNotebookSourcesForSend,
    researchDatabase,
    chatAcademicFilters,
    chatSettings?.smartModel,
    activeConversationId,
    messages.length,
    onCreateConversation,
    onSelectConversation,
  ]);

  const handleSendChip = useCallback(
    (text: string): boolean => {
      if (chatInputDisabled || !notebookId || !onSendMessage) return false;
      if (composerMode !== "chat") return false;
      if (!validateNotebookSourcesForSend()) return false;

      onSendMessage(text, undefined, chatSourcePolicy);
      return true;
    },
    [
      chatInputDisabled,
      notebookId,
      onSendMessage,
      composerMode,
      chatSourcePolicy,
      validateNotebookSourcesForSend,
    ]
  );

  // --- Scroll to bottom ---

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

  // --- Tooltip position computation ---

  const tooltipContent = useMemo(() => {
    if (hoveredRefId === null || hoveredMessageId === null || !messagesContainerRef.current)
      return null;
    const hoveredMessage = messages.find((msg) => msg.id === hoveredMessageId);
    const refsArray = Array.isArray(hoveredMessage?.references) ? hoveredMessage.references : [];
    // Citations [n] match the n-th source in the grounded prompt order, not retrieval chunk.id.
    const ref =
      hoveredRefId >= 1 && hoveredRefId <= refsArray.length
        ? refsArray[hoveredRefId - 1]
        : refsArray.find((r) => Number(r.id) === hoveredRefId);

    const containerRect = messagesContainerRef.current.getBoundingClientRect();
    if (!ref || !containerRect) return null;

    const tooltipWidth = 384;
    const rawX = (tooltipStyle.left || 0) + containerRect.left - tooltipWidth / 2;
    const x = Math.max(
      containerRect.left + 16,
      Math.min(rawX, containerRect.right - tooltipWidth - 16)
    );
    const y =
      tooltipPosition === "top"
        ? containerRect.top + (tooltipStyle.top || 0) - 256 - 2
        : containerRect.top + (tooltipStyle.top || 0);

    return { ref, x, y };
  }, [hoveredRefId, hoveredMessageId, messages, tooltipStyle, tooltipPosition]);

  const handleOpenReferenceInSources = useCallback(
    (reference: ReferenceChunk) => {
      const docId = reference.documentId?.trim();
      if (!docId || !onOpenNotebookSource) return;
      if (!sources.some((s) => s.id === docId)) return;
      onOpenNotebookSource(docId);
      setHoveredRefId(null);
      setHoveredMessageId(null);
      setIsTooltipHovered(false);
      if (hideTooltipTimeoutRef.current) {
        clearTimeout(hideTooltipTimeoutRef.current);
        hideTooltipTimeoutRef.current = null;
      }
    },
    [onOpenNotebookSource, sources]
  );

  const memoizedMessages = useMemo(() => messages, [messages]);

  // Literature review session polling
  const literatureSession = useLiteratureReviewSession(activeLiteratureSessionId);

  const isLiteratureReviewActive =
    activeLiteratureSessionId != null &&
    literatureSession?.status != null &&
    literatureSession.status !== "completed" &&
    literatureSession.status !== "failed";

  const isInputDisabled =
    chatInputDisabled || isLiteratureReviewActive || isStartingLiteratureReview;

  const newChatLabel = isCreatingConversation
    ? "Creating…"
    : messages.length === 0
      ? "Already in a new chat"
      : "New chat";

  const chatHeaderToolbar = (
    <div className="flex shrink-0 items-center gap-2">
      <div className="hidden items-center gap-2 md:flex">
        {!isLeftOpen && (
          <HeaderTooltip label="Open Sources">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={toggleLeft}
              aria-label="Open Sources"
            >
              <PanelLeftOpen />
            </Button>
          </HeaderTooltip>
        )}
        {!isRightOpen && (
          <HeaderTooltip label="Open Studio">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              data-onboarding="studio-panel-toggle"
              onClick={toggleRight}
              aria-label="Open Studio"
            >
              <PanelRightOpen />
            </Button>
          </HeaderTooltip>
        )}
      </div>
      <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
        <HeaderTooltip label="Thread history">
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Thread history">
              <History />
            </Button>
          </PopoverTrigger>
        </HeaderTooltip>
        <PopoverContent
          align="end"
          collisionPadding={16}
          aria-label="Thread history"
          onEscapeKeyDown={keepHistoryOpenOnRenameEscape}
          padding="none"
          className="flex max-h-(--radix-popover-content-available-height) w-80 max-w-(--radix-popover-content-available-width) flex-col"
        >
          {/* A plain scroller, not ScrollArea: its display:table content wrapper defeats the rows' truncate. */}
          <div className="max-h-120 min-h-0 overflow-y-auto overscroll-contain p-1.5">
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelect={(id) => {
                onSelectConversation?.(id);
                setHistoryOpen(false);
              }}
              onRename={onRenameConversation}
              onDelete={onDeleteConversation}
              pinnedIds={pinnedIds}
              onTogglePin={handleTogglePin}
            />
          </div>
        </PopoverContent>
      </Popover>
      <HeaderTooltip label={newChatLabel}>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleNewConversation}
          disabled={isCreatingConversation}
          aria-label={newChatLabel}
        >
          {isCreatingConversation ? <Spinner aria-hidden /> : <Plus />}
        </Button>
      </HeaderTooltip>
      <DropdownMenu modal={false}>
        <HeaderTooltip label="Chat options">
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Chat options">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
        </HeaderTooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsConfigModalOpen(true)}>
            <Settings2 />
            Configure chat
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleExportChat}>
            <Download />
            Export chat
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleSaveToNote()}>
            <FileText />
            Save to note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handlePinActiveChat}>
            <Pin />
            {activeConversationId && pinnedIds.has(activeConversationId)
              ? "Unpin chat"
              : "Pin chat"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Panel header: visible on mobile (z-20) like Sources/Studio; desktop uses md:z-10 */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-background/80 p-4 backdrop-blur-sm sticky top-0 z-20 h-14 shrink-0 md:z-10">
          <div className="flex min-w-0 items-center gap-2 text-foreground">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="truncate font-display font-bold text-sm tracking-wide uppercase">
              Chat
            </span>
          </div>
          {chatHeaderToolbar}
        </div>

        {/* Messages Area */}
        <div className="flex flex-1 min-h-0">
          <div
            ref={messagesContainerRef}
            className={`min-h-0 w-full min-w-0 flex-1 relative chat-panel-graph-grid ${
              messages.length === 0
                ? "overflow-y-auto overflow-x-hidden"
                : "flex overflow-x-hidden overflow-y-hidden"
            }`}
          >
            {messages.length === 0 ? (
              <ChatEmptyState
                onSendMessage={handleSendChip}
                disabled={chatInputDisabled}
                sourceCount={sourceCount}
                sourceSummary={sourceSummary}
                suggestions={suggestions}
                isLoadingSuggestions={isLoadingSuggestions}
                notebookIcon={notebookIcon}
                notebookCoverColor={notebookCoverColor}
                notebookTitle={notebookTitle}
              />
            ) : (
              <Virtuoso
                ref={virtuosoRef}
                className="min-h-0 w-full min-w-0"
                style={{ height: "100%" }}
                data={memoizedMessages}
                itemContent={(_index, message) => (
                  <div className="max-w-full min-w-0 overflow-x-hidden px-3 py-3 sm:px-4 md:px-6">
                    {message.researchPlan ? (
                      <ResearchPlanMessage
                        planId={message.researchPlan.planId}
                        subQuestions={(message.researchPlan.subQuestions as any[]) ?? []}
                        onApprove={handleApproveResearchPlan}
                        onReject={handleRejectResearchPlan}
                        onOpenTable={onOpenLiteratureTable}
                        onOpenReport={onOpenLiteratureReport}
                      />
                    ) : message.literatureReview ? (
                      <LiteratureReviewMessage
                        message={message}
                        onOpenTable={onOpenLiteratureTable}
                        onOpenReport={onOpenLiteratureReport}
                        onOpenRankedPapers={onOpenRankedPapers}
                        onOpenScreeningDecisions={onOpenScreeningDecisions}
                      />
                    ) : (
                      <>
                        <MessageBubble
                          message={message}
                          isAssistantStreamActive={
                            message.id === "__streaming__" ? isLoading : false
                          }
                          refHandlers={refHandlers}
                          onCopyMessage={copyMessageAsMarkdown}
                          copiedMessageId={copiedMessageId}
                          onSetFeedback={onSetFeedback}
                          onSendFollowUp={handleSendChip}
                          onRetry={onRetry}
                          externalSources={message.externalSources}
                          onAddExternalSources={async (selectedSources) => {
                            if (!notebookId) return;
                            try {
                              await addExternalSourcesMutation({
                                notebookId: notebookId as Id<"notebooks">,
                                sources: selectedSources.map((s) => ({
                                  title: s.title,
                                  url: s.url,
                                  snippet: s.snippet,
                                  sourceType: s.sourceType,
                                })),
                              });
                            } catch (e) {
                              console.error("Failed to add external sources:", e);
                            }
                          }}
                          showSourcesButton={
                            message.role === "assistant" &&
                            !!message.externalSources &&
                            message.externalSources.length > 0
                          }
                          notebookId={notebookId ?? undefined}
                          onOpenNotebookSource={onOpenNotebookSource}
                          notebookDocumentIds={notebookDocumentIds}
                        />
                      </>
                    )}
                  </div>
                )}
                scrollerRef={setMessageScroller}
                components={MESSAGE_LIST_COMPONENTS}
                defaultItemHeight={150}
                increaseViewportBy={{ top: 200, bottom: 400 }}
              />
            )}

            {/* Floating Reference Tooltip */}
            {tooltipContent && (
              <ReferenceTooltip
                hoveredRefId={hoveredRefId!}
                tooltipRef={tooltipRef}
                reference={tooltipContent.ref}
                position={{ x: tooltipContent.x, y: tooltipContent.y }}
                onOpenInSources={(() => {
                  const docId = tooltipContent.ref.documentId?.trim();
                  if (!docId || !onOpenNotebookSource || !sources.some((s) => s.id === docId)) {
                    return undefined;
                  }
                  return () => handleOpenReferenceInSources(tooltipContent.ref);
                })()}
                onAddToNotebook={(() => {
                  const isExternal =
                    !tooltipContent.ref.documentId && !!tooltipContent.ref.sourceUrl;
                  if (!isExternal || !notebookId) return undefined;
                  return async () => {
                    try {
                      await addExternalSourcesMutation({
                        notebookId: notebookId as Id<"notebooks">,
                        sources: [
                          {
                            title: tooltipContent.ref.sourceTitle,
                            url: tooltipContent.ref.sourceUrl!,
                            snippet: tooltipContent.ref.content.slice(0, 500),
                            sourceType: "web",
                          },
                        ],
                      });
                    } catch (e) {
                      console.error("Failed to add external source:", e);
                    }
                  };
                })()}
                onMouseEnter={() => {
                  setIsTooltipHovered(true);
                  if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
                }}
                onMouseLeave={() => {
                  setIsTooltipHovered(false);
                  hideTooltipTimeoutRef.current = setTimeout(() => {
                    if (!isTooltipHovered) {
                      setHoveredRefId(null);
                      setHoveredMessageId(null);
                    }
                  }, 100);
                }}
              />
            )}
          </div>
        </div>

        {/* Input Area — wrapper is full-width for layout; without pointer-events-none it steals taps beside the input (e.g. message actions on mobile). */}
        <div
          ref={composerRef}
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex min-w-0 justify-center px-3 pb-3 sm:px-4"
        >
          {/* Opaque band behind the disclaimer strip so messages scrolled under the composer don't show through its text. */}
          <div
            className="absolute inset-x-0 bottom-0 -z-10 h-28 max-h-full bg-linear-to-t from-background from-60% to-transparent"
            aria-hidden
          />
          <ChatInput
            value={inputMessage}
            onChange={setInputMessage}
            onSend={handleSendMessage}
            disabled={isInputDisabled}
            isStreaming={isLoading || isLiteratureReviewActive || isStartingLiteratureReview}
            waitingOnRemoteGeneration={waitingOnRemoteGeneration}
            onStop={onStopChat}
            notebookId={notebookId}
            mode={composerMode}
            onModeChange={handleComposerModeChange}
            researchDatabase={researchDatabase}
            onResearchDatabaseChange={setResearchDatabase}
            sourceFilters={sourceFilters}
            onSourceFilterChange={setSourceFilters}
            academicDiscoveryFilters={chatAcademicFilters}
            onAcademicDiscoveryFiltersChange={(patch) =>
              setChatAcademicFilters((prev) => ({ ...prev, ...patch }))
            }
            chatSettings={chatSettings}
            onModelChange={(modelId) =>
              handleSaveChatConfig(
                {
                  instructionMode: chatSettings?.instructionMode ?? "default",
                  responseLength: chatSettings?.responseLength ?? "default",
                  customInstructions: chatSettings?.customInstructions,
                  smartModel: modelId,
                },
                { silentSuccess: true }
              )
            }
            onAppendTranscription={(text) => {
              setInputMessage((prev) => {
                const t = text.trim();
                if (!t) {
                  return prev;
                }
                if (!prev.trim()) {
                  return t;
                }
                return `${prev} ${t}`;
              });
            }}
            onVoiceError={toastError}
          />
        </div>
      </div>
      <ConfigureChatModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSave={handleSaveChatConfig}
        chatSettings={chatSettings}
        saving={isSavingConfig}
        instructionModeLocked={messages.length > 0}
      />
    </>
  );
};
