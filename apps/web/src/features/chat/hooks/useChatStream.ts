import { api } from "@convex/_generated/api";
import { type Doc, Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mergePendingStudioNotes,
  prunePendingStudioNotes,
} from "@/features/studio/utils/mergePendingStudioNotes";
import {
  AgentGroundingCheck,
  ChatActivityPhase,
  ChatAgentTrace,
  Message,
  MessageToolCall,
  Note,
  Source,
} from "@/shared/types/index";
import type { ChatStreamSourcePolicy } from "../chatStreamTypes";
import {
  consumePersistentTextStream,
  useSendMessage,
  useSetMessageFeedback,
  useSourceSuggestions,
} from "../services/chatApi";
import { useStartDeepResearch } from "../services/researchApi";
import {
  computeRemoteGenerationBlocksSend,
  researchProgressToStreamingActivity,
} from "../utils/chatStreamHelpers";

type StudioListOverlayState = {
  notebookId: string | null;
  pending: Note[];
  savedChat: Note | null;
};

interface UseChatStreamProps {
  activeNotebookId: string | null;
  activeConversationId: string | null;
  sources: Source[];
  notes: Note[];
  documents: Doc<"documents">[];
}

const SKEW_MS = 120_000;

export function useChatStream({
  activeNotebookId,
  activeConversationId,
  sources,
  notes,
  documents,
}: UseChatStreamProps) {
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const chatBundle = useQuery(
    api.chat.messages.listByNotebook,
    activeNotebookId && activeNotebookId !== "new"
      ? {
          notebookId: activeNotebookId as Id<"notebooks">,
          conversationId: activeConversationId
            ? (activeConversationId as Id<"conversations">)
            : undefined,
        }
      : "skip"
  );

  const messages = useMemo(() => chatBundle?.messages ?? [], [chatBundle?.messages]);
  const chatRemoteGenerating = chatBundle?.chatGenerating ?? false;

  /** True when server reports an in-flight generation and the DB still expects a reply (last row is not assistant). */
  const remoteGenerationBlocksSend = useMemo(
    () => computeRemoteGenerationBlocksSend(chatRemoteGenerating, messages),
    [chatRemoteGenerating, messages]
  );

  const clearChatHistoryMutation = useMutation(api.chat.messages.clearHistory);
  const deleteMessagesFromMutation = useMutation(api.chat.messages.deleteMessagesFrom);
  const releaseChatGenerationMutation = useMutation(api.chat.messages.releaseChatGeneration);
  const { sendMessage, stopChat: stopSendMessage } = useSendMessage();
  const startDeepResearch = useStartDeepResearch();
  const setMessageFeedback = useSetMessageFeedback();

  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingReferences, setStreamingReferences] = useState<unknown[] | null>(null);
  const [streamingJustFinished, setStreamingJustFinished] = useState(false);
  const [streamingToolCalls, setStreamingToolCalls] = useState<MessageToolCall[]>([]);
  const [streamingTracePhases, setStreamingTracePhases] = useState<
    Array<{ status: string; message: string }>
  >([]);
  const [streamingPhase, setStreamingPhase] = useState<ChatActivityPhase | null>(null);
  const [streamingPhaseDetail, setStreamingPhaseDetail] = useState<string | null>(null);
  const [streamingGrounding, setStreamingGrounding] = useState<AgentGroundingCheck[]>([]);
  const [streamingClarification, setStreamingClarification] = useState<string | null>(null);
  const [lastAssistantFollowUps, setLastAssistantFollowUps] = useState<string[] | null>(null);
  const [streamingResearchPlan, setStreamingResearchPlan] = useState<{
    planId: string;
    subQuestions: unknown[];
    sourcePolicy: unknown;
  } | null>(null);
  const [externalSources, setExternalSources] = useState<
    Array<{ title: string; url: string; snippet: string; sourceType: string; score?: number }>
  >([]);
  const messagesLengthWhenStreamCompleteRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const streamStartedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [studioListOverlay, setStudioListOverlay] = useState<StudioListOverlayState>({
    notebookId: null,
    pending: [],
    savedChat: null,
  });

  const displayNotes = useMemo(() => {
    const overlayNotebook = studioListOverlay.notebookId;
    const pending = overlayNotebook === activeNotebookId ? studioListOverlay.pending : [];
    const withPending = mergePendingStudioNotes(notes, prunePendingStudioNotes(notes, pending));
    if (studioListOverlay.savedChat && overlayNotebook === activeNotebookId) {
      return [studioListOverlay.savedChat, ...withPending];
    }
    return withPending;
  }, [notes, studioListOverlay, activeNotebookId]);

  const addPendingStudioNote = useCallback(
    (note: Note) => {
      if (!activeNotebookId) return;
      setStudioListOverlay((prev) => {
        const basePending = prev.notebookId === activeNotebookId ? prev.pending : [];
        return {
          notebookId: activeNotebookId,
          pending: [note, ...prunePendingStudioNotes(notes, basePending)],
          savedChat: prev.notebookId === activeNotebookId ? prev.savedChat : null,
        };
      });
    },
    [activeNotebookId, notes]
  );

  const updatePendingStudioNote = useCallback((placeholderId: string, note: Note) => {
    setStudioListOverlay((prev) => ({
      ...prev,
      pending: prev.pending.map((pending) => (pending.id === placeholderId ? note : pending)),
    }));
  }, []);

  const removePendingStudioNote = useCallback((id: string) => {
    setStudioListOverlay((prev) => ({
      ...prev,
      pending: prev.pending.filter((note) => note.id !== id),
    }));
  }, []);

  const setOptimisticSaveNote = useCallback(
    (payload: { notebookId: string; note: Note } | null) => {
      if (payload === null) {
        setStudioListOverlay((prev) => ({ ...prev, savedChat: null }));
        return;
      }
      setStudioListOverlay((prev) => ({
        notebookId: payload.notebookId,
        pending: prev.notebookId === payload.notebookId ? prev.pending : [],
        savedChat: payload.note,
      }));
    },
    []
  );

  const resetStreamingState = useCallback(() => {
    setIsChatStreaming(false);
    setStreamingContent("");
    setStreamingReferences(null);
    setStreamingJustFinished(false);
    setStreamingToolCalls([]);
    setStreamingTracePhases([]);
    setStreamingPhase(null);
    setStreamingPhaseDetail(null);
    setStreamingGrounding([]);
    setStreamingClarification(null);
    setStreamingResearchPlan(null);
    streamStartedAtRef.current = null;
  }, []);

  // Reset streaming state when switching to a different conversation
  useEffect(() => {
    // Abort any in-flight research stream for the previous conversation
    // so its callbacks do not leak into the new chat's UI state.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    resetStreamingState();
    setExternalSources([]);
  }, [activeConversationId, resetStreamingState]);

  // Auto-release stale chat generations (when generation is stuck for >5 minutes)
  // This prevents the "Generating in another tab" message from showing forever
  // when a stream crashes or is interrupted.
  const STALE_GENERATION_MS = 5 * 60 * 1000; // 5 minutes
  useEffect(() => {
    if (!isChatStreaming && chatRemoteGenerating && chatBundle?.chatGenerationStartedAt) {
      const startedAt = chatBundle.chatGenerationStartedAt;
      const now = Date.now();
      const age = now - startedAt;

      // Only auto-release if:
      // 1. Generation is old (>5 min)
      // 2. We're not actively streaming locally
      // 3. Last message is already an assistant (generation lock stuck after persist)
      const last = messages[messages.length - 1];
      const isWaitingForAssistant = last?.role !== "assistant";

      if (age > STALE_GENERATION_MS && !isWaitingForAssistant && activeNotebookId) {
        // Silently release the stuck generation
        releaseChatGenerationMutation({
          notebookId: activeNotebookId as Id<"notebooks">,
        }).catch(() => {
          // Best-effort: if it fails, user can manually retry
        });
      }
    }
  }, [
    isChatStreaming,
    chatRemoteGenerating,
    chatBundle?.chatGenerationStartedAt,
    messages,
    activeNotebookId,
    releaseChatGenerationMutation,
    STALE_GENERATION_MS,
  ]);

  const handleSendMessage = useCallback(
    async (
      messageText: string,
      deepResearch?: boolean,
      sourcePolicy?: ChatStreamSourcePolicy,
      sendOptions?: { documentIdsOverride?: string[] }
    ) => {
      if (!activeNotebookId || isChatStreaming) return;
      if (chatRemoteGenerating) {
        const last = messagesRef.current.at(-1) as Doc<"messages"> | undefined;
        if (last?.role !== "assistant") return;
        try {
          await releaseChatGenerationMutation({
            notebookId: activeNotebookId as Id<"notebooks">,
          });
        } catch {
          /* best-effort: persist path may have already cleared the refcount */
        }
      }

      streamStartedAtRef.current = Date.now();
      setIsChatStreaming(true);
      setStreamingContent("");
      setStreamingReferences(null);
      const hasNotebookSearch = sourcePolicy?.channels?.includes("notebook") ?? true;
      const override = sendOptions?.documentIdsOverride;
      const selectedDocumentIds = !hasNotebookSearch
        ? []
        : override && override.length > 0
          ? override
          : sourcesRef.current.filter((source) => source.selected).map((source) => source.id);

      setStreamingToolCalls([]);
      setStreamingTracePhases([]);
      setStreamingPhase(null);
      setStreamingPhaseDetail(null);
      setStreamingGrounding([]);
      setStreamingClarification(null);
      setLastAssistantFollowUps(null);
      setExternalSources([]);

      const onStreamComplete = () => {
        setIsChatStreaming(false);
        setStreamingJustFinished(true);
        // Keep trace, tool calls, phase, and grounding until the synthetic __streaming__ row
        // is removed (streamingContent cleared after the persisted assistant message arrives).
        // Clearing them here left a gap where the panel still showed with empty toolCalls, so
        // AgentActivityPanel fell back to "phases only, tools at end" and looked broken.
        const len = messagesRef.current.length;
        messagesLengthWhenStreamCompleteRef.current = len > 0 ? len : -1;
        streamStartedAtRef.current = null;
      };

      if (deepResearch) {
        try {
          await startDeepResearch({
            notebookId: activeNotebookId as Id<"notebooks">,
            conversationId: activeConversationId
              ? (activeConversationId as Id<"conversations">)
              : undefined,
            query: messageText,
            sourcePolicy,
          });
        } catch {
          resetStreamingState();
        } finally {
          setIsChatStreaming(false);
        }
      } else {
        try {
          // Set up abort controller for this stream
          abortControllerRef.current = new AbortController();

          await sendMessage(
            activeNotebookId,
            messageText,
            {
              onToken: (token) => setStreamingContent((prev) => prev + token),
              onReferences: (refs) => setStreamingReferences(refs),
              onStatus: (status, message) => {
                const allowed: ChatActivityPhase[] = [
                  "searching",
                  "reading",
                  "planning",
                  "thinking",
                  "generating",
                  "writing",
                  "retrieving",
                  "embedding",
                  "ranking",
                  "completed",
                ];
                if (allowed.includes(status as ChatActivityPhase)) {
                  setStreamingPhase(status as ChatActivityPhase);
                } else {
                  setStreamingPhase("thinking");
                }
                setStreamingPhaseDetail(message ?? null);
                const msg = message ?? "";
                setStreamingTracePhases((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.status === status && last.message === msg) return prev;
                  return [...prev, { status, message: msg }];
                });
              },
              onToolCalls: (tcs) => setStreamingToolCalls(tcs),
              onGroundingChecks: (checks) => setStreamingGrounding(checks),
              onClarification: (q) => setStreamingClarification(q),
              onResearchPlan: (plan) => setStreamingResearchPlan(plan),
              onResearchProgress: (p) => {
                const { phase, detail } = researchProgressToStreamingActivity(p);
                const allowed: ChatActivityPhase[] = [
                  "searching",
                  "reading",
                  "planning",
                  "thinking",
                  "generating",
                  "writing",
                  "retrieving",
                  "embedding",
                  "ranking",
                  "completed",
                ];
                const st = allowed.includes(phase) ? phase : "thinking";
                setStreamingPhase(st);
                setStreamingPhaseDetail(detail);
                setStreamingTracePhases((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.status === st && last.message === detail) return prev;
                  return [...prev, { status: st, message: detail }];
                });
              },
              onFollowUps: (qs) => setLastAssistantFollowUps(qs),
              onExternalSources: (sources) => setExternalSources(sources),
              onComplete: onStreamComplete,
              onStopped: () => {
                setIsChatStreaming(false);
                setStreamingJustFinished(true);
                streamStartedAtRef.current = null;
                abortControllerRef.current = null;
              },
              onError: () => {
                resetStreamingState();
                abortControllerRef.current = null;
              },
            },
            selectedDocumentIds.length > 0 ? selectedDocumentIds : [],
            deepResearch,
            sourcePolicy,
            activeConversationId ?? undefined
          );
        } catch {
          resetStreamingState();
        }
      }
    },
    [
      activeNotebookId,
      activeConversationId,
      isChatStreaming,
      chatRemoteGenerating,
      releaseChatGenerationMutation,
      sendMessage,
      startDeepResearch,
      resetStreamingState,
    ]
  );

  const handleClearChatHistory = useCallback(async () => {
    if (!activeNotebookId || activeNotebookId === "new") return;
    // Abort any active stream before clearing so stale callbacks don't repopulate UI.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await clearChatHistoryMutation({
        notebookId: activeNotebookId as Id<"notebooks">,
        conversationId: activeConversationId
          ? (activeConversationId as Id<"conversations">)
          : undefined,
      });
      resetStreamingState();
    } catch (error) {
      console.error("Failed to clear chat history", error);
      resetStreamingState();
    }
  }, [activeNotebookId, activeConversationId, clearChatHistoryMutation, resetStreamingState]);

  useEffect(() => {
    const refLen = messagesLengthWhenStreamCompleteRef.current;
    if (
      streamingJustFinished &&
      (messages.length >= refLen || refLen < 0) &&
      messages[messages.length - 1]?.role === "assistant"
    ) {
      setStreamingContent("");
      setStreamingReferences(null);
      setStreamingJustFinished(false);
      setStreamingToolCalls([]);
      setStreamingTracePhases([]);
      setStreamingPhase(null);
      setStreamingPhaseDetail(null);
      setStreamingGrounding([]);
      setStreamingClarification(null);
      setStreamingResearchPlan(null);
    }
  }, [streamingJustFinished, messages]);

  useEffect(() => {
    if (!isChatStreaming || !streamingContent.trim()) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || !last.content) return;
    if (last.content.trimEnd() !== streamingContent.trimEnd()) return;

    setIsChatStreaming(false);
    setStreamingToolCalls([]);
    setStreamingTracePhases([]);
    setStreamingPhase(null);
    setStreamingPhaseDetail(null);
    setStreamingGrounding([]);
    setStreamingClarification(null);
    setStreamingJustFinished(true);
    messagesLengthWhenStreamCompleteRef.current = messages.length - 1;
  }, [isChatStreaming, streamingContent, messages]);

  useEffect(() => {
    if (!isChatStreaming || streamingContent.trim()) return;
    const t0 = streamStartedAtRef.current;
    if (t0 == null) return;
    const n = messages.length;
    if (n < 2) return;
    const assistant = messages[n - 1] as Doc<"messages">;
    const user = messages[n - 2] as Doc<"messages">;
    if (assistant?.role !== "assistant" || user?.role !== "user") return;
    const assistantText =
      typeof assistant.content === "string" ? assistant.content : String(assistant.content ?? "");
    if (!assistantText.trim()) return;
    if (typeof assistant.createdAt !== "number" || assistant.createdAt < t0 - SKEW_MS) return;

    resetStreamingState();
  }, [isChatStreaming, streamingContent, messages, resetStreamingState]);

  const chatDisplayMessages = useMemo((): Message[] => {
    const list: Message[] = messages.map((msg: Doc<"messages">, index: number) => {
      const meta = (
        msg as Doc<"messages"> & {
          metadata?: {
            agentTrace?: ChatAgentTrace;
            researchPlanId?: string;
            isResearchPlan?: boolean;
            externalSources?: Array<{
              title: string;
              url: string;
              snippet: string;
              sourceType: string;
              score?: number;
            }>;
            isLiteratureReview?: boolean;
            isResearchResult?: boolean;
            researchRunId?: string;
            sessionId?: string;
            status?: string;
            query?: string;
            tableId?: string;
            reportId?: string;
            suggestedColumns?: Array<{
              id: string;
              name: string;
              instructions?: string;
              isVisible: boolean;
            }>;
            error?: string;
          };
        }
      ).metadata;
      const trace = meta?.agentTrace;
      return {
        id: msg._id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: new Date(msg.createdAt as number),
        references: msg.references,
        feedback: (msg as any).feedback as "up" | "down" | undefined,
        followUps:
          !streamingContent &&
          msg.role === "assistant" &&
          index === messages.length - 1 &&
          lastAssistantFollowUps
            ? lastAssistantFollowUps
            : undefined,
        agentTrace: trace,
        externalSources: meta?.externalSources,
        researchPlan:
          meta?.isResearchPlan && meta?.researchPlanId
            ? (streamingResearchPlan ?? {
                planId: meta.researchPlanId,
                subQuestions: [],
                sourcePolicy: {},
              })
            : undefined,
        literatureReview:
          meta?.isLiteratureReview && meta?.sessionId
            ? {
                sessionId: meta.sessionId,
                status: meta.status ?? "planning",
                query: meta.query ?? "",
                tableId: meta.tableId,
                reportId: meta.reportId,
                suggestedColumns: meta.suggestedColumns,
                error: meta.error,
              }
            : undefined,
        deepResearch:
          meta?.isResearchResult && meta?.researchRunId
            ? { researchRunId: String(meta.researchRunId) }
            : undefined,
      };
    });
    const t0 = streamStartedAtRef.current;
    const last = messages[messages.length - 1] as Doc<"messages"> | undefined;
    const prev = messages[messages.length - 2] as Doc<"messages"> | undefined;
    const lastAssistantText =
      last?.content == null
        ? ""
        : typeof last.content === "string"
          ? last.content
          : String(last.content);
    const ghostStuckAssistantRow =
      isChatStreaming &&
      !streamingContent.trim() &&
      t0 != null &&
      last?.role === "assistant" &&
      prev?.role === "user" &&
      !!lastAssistantText.trim() &&
      typeof last.createdAt === "number" &&
      last.createdAt >= t0 - SKEW_MS;

    if (
      (isChatStreaming || streamingContent || streamingClarification) &&
      !ghostStuckAssistantRow
    ) {
      const toolSearching = streamingToolCalls.some((t) => t.status === "searching");
      let phaseForRow: ChatActivityPhase | undefined = streamingClarification
        ? "completed"
        : (streamingPhase ??
          (toolSearching ? "searching" : streamingContent.trim() ? "writing" : "thinking"));
      if (streamingContent.trim() && !toolSearching && !streamingClarification) {
        const p = phaseForRow;
        if (p === "generating" || p === "thinking" || p === "reading") {
          phaseForRow = "writing";
        }
      }
      const statusDetailForRow =
        streamingClarification || phaseForRow === "writing"
          ? undefined
          : (streamingPhaseDetail ?? undefined);
      const streamingTrace =
        streamingTracePhases.length > 0 ||
        streamingToolCalls.length > 0 ||
        streamingGrounding.length > 0
          ? {
              phases: streamingTracePhases,
              toolCalls: streamingToolCalls,
              grounding: streamingGrounding,
            }
          : undefined;
      list.push({
        id: "__streaming__",
        role: "assistant",
        content: streamingClarification
          ? `**Could you clarify?**\n\n${streamingClarification}`
          : streamingContent,
        timestamp: new Date(),
        references: (streamingReferences as Message["references"]) ?? undefined,
        toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
        groundingChecks: streamingGrounding.length > 0 ? streamingGrounding : undefined,
        agentTrace: streamingTrace,
        status: phaseForRow,
        statusDetail: statusDetailForRow,
        clarificationQuestion: streamingClarification ?? undefined,
        externalSources: externalSources.length > 0 ? externalSources : undefined,
      });
    }

    const showRemoteOnlyPlaceholder =
      chatRemoteGenerating &&
      !isChatStreaming &&
      !streamingContent.trim() &&
      !streamingClarification &&
      !ghostStuckAssistantRow;

    if (showRemoteOnlyPlaceholder) {
      const lastMsg = messages[messages.length - 1] as Doc<"messages"> | undefined;
      if (lastMsg?.role === "user") {
        list.push({
          id: "__remote_generating__",
          role: "assistant",
          content: "",
          timestamp: new Date(),
          status: "thinking",
          statusDetail: "Searching...",
        });
      }
    }

    return list;
  }, [
    messages,
    streamingContent,
    streamingReferences,
    streamingToolCalls,
    streamingTracePhases,
    streamingPhase,
    streamingPhaseDetail,
    streamingGrounding,
    streamingClarification,
    streamingResearchPlan,
    externalSources,
    lastAssistantFollowUps,
    isChatStreaming,
    chatRemoteGenerating,
  ]);

  const handleRetryMessage = useCallback(
    async (assistantMessageId: string) => {
      if (isChatStreaming || remoteGenerationBlocksSend) return;
      const idx = chatDisplayMessages.findIndex((m) => m.id === assistantMessageId);
      if (idx < 0) return;

      let userContent = "";
      let userMessageId: string | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (chatDisplayMessages[i].role === "user") {
          userContent = chatDisplayMessages[i].content;
          userMessageId = chatDisplayMessages[i].id;
          break;
        }
      }
      if (!userContent || !userMessageId) return;

      await deleteMessagesFromMutation({ messageId: userMessageId as Id<"messages"> });
      handleSendMessage(userContent);
    },
    [
      chatDisplayMessages,
      isChatStreaming,
      remoteGenerationBlocksSend,
      handleSendMessage,
      deleteMessagesFromMutation,
    ]
  );

  // Central stop function that aborts both regular chat and research streams
  const stopChat = useCallback(() => {
    // Abort the shared abort controller (used by research stream)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Also stop the regular send message stream
    stopSendMessage();

    // Signal server-side cancellation so background generation does not persist
    // a late assistant message after local abort.
    if (activeNotebookId && activeNotebookId !== "new") {
      void releaseChatGenerationMutation({
        notebookId: activeNotebookId as Id<"notebooks">,
        conversationId: activeConversationId
          ? (activeConversationId as Id<"conversations">)
          : undefined,
      }).catch(() => {
        // Best-effort cancellation; stream may have already completed.
      });
    }
  }, [stopSendMessage, activeNotebookId, activeConversationId, releaseChatGenerationMutation]);

  const sourceSuggestions = useSourceSuggestions(
    activeNotebookId && activeNotebookId !== "new" ? activeNotebookId : null,
    documents
  );
  const sourceCount = useMemo(
    () => documents.filter((d: any) => d.status === "completed").length,
    [documents]
  );

  const consumeResearchExecuteStream = useCallback(
    async (response: Response) => {
      if (isChatStreaming) return;

      const onResearchStreamComplete = () => {
        setIsChatStreaming(false);
        setStreamingJustFinished(true);
        const len = messagesRef.current.length;
        messagesLengthWhenStreamCompleteRef.current = len > 0 ? len : -1;
        streamStartedAtRef.current = null;
        abortControllerRef.current = null;
      };

      const pushStatus = (status: string, message?: string) => {
        const allowed: ChatActivityPhase[] = [
          "searching",
          "reading",
          "planning",
          "thinking",
          "generating",
          "writing",
          "retrieving",
          "embedding",
          "ranking",
          "completed",
        ];
        const phase = allowed.includes(status as ChatActivityPhase)
          ? (status as ChatActivityPhase)
          : "thinking";
        setStreamingPhase(phase);
        setStreamingPhaseDetail(message ?? null);
        const msg = message ?? "";
        setStreamingTracePhases((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.status === phase && last.message === msg) return prev;
          return [...prev, { status: phase, message: msg }];
        });
      };

      setIsChatStreaming(true);
      setStreamingContent("");
      setStreamingReferences(null);
      setStreamingToolCalls([]);
      setStreamingGrounding([]);
      setStreamingClarification(null);
      setStreamingPhase("planning");
      setStreamingPhaseDetail("Running approved research…");
      setStreamingTracePhases([{ status: "planning", message: "Running approved research…" }]);
      streamStartedAtRef.current = Date.now();

      // Set up abort controller for this stream
      abortControllerRef.current = new AbortController();

      try {
        await consumePersistentTextStream(
          response,
          {
            onToken: (token) => setStreamingContent((prev) => prev + token),
            onReferences: (refs) => setStreamingReferences(refs),
            onStatus: (status, message) => pushStatus(status, message),
            onResearchProgress: (p) => {
              const { phase, detail } = researchProgressToStreamingActivity(p);
              pushStatus(phase, detail);
            },
            onToolCalls: (tcs) => setStreamingToolCalls(tcs),
            onGroundingChecks: (checks) => setStreamingGrounding(checks),
            onComplete: onResearchStreamComplete,
            onStopped: () => {
              setIsChatStreaming(false);
              setStreamingJustFinished(true);
              streamStartedAtRef.current = null;
              abortControllerRef.current = null;
            },
            onError: () => {
              resetStreamingState();
              abortControllerRef.current = null;
            },
          },
          abortControllerRef.current.signal
        );
      } catch {
        resetStreamingState();
        abortControllerRef.current = null;
        throw new Error("Research stream failed");
      }
    },
    [isChatStreaming, resetStreamingState]
  );

  return {
    chatDisplayMessages,
    isChatStreaming,
    remoteChatGenerating: chatRemoteGenerating,
    remoteGenerationBlocksSend,
    displayNotes,
    addPendingStudioNote,
    updatePendingStudioNote,
    removePendingStudioNote,
    handleSendMessage,
    handleClearChatHistory,
    setMessageFeedback,
    handleRetryMessage,
    setOptimisticSaveNote,
    consumeResearchExecuteStream,
    stopChat,
    sourceCount,
    sourceSummary: sourceSuggestions.summary,
    suggestions: sourceSuggestions.suggestions,
    isLoadingSuggestions: sourceSuggestions.isLoading,
    externalSources,
    clearExternalSources: () => setExternalSources([]),
  };
}
