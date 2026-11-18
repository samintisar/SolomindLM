import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useErrorToast } from "@/shared/hooks/useErrorToast";
import type {
  AgentGroundingCheck,
  ChatActivityPhase,
  ChatAgentTrace,
  ExternalSource,
  Message,
  MessageToolCall,
  ReferenceChunk,
  Source,
} from "@/shared/types/index";
import type { ChatStreamSourcePolicy } from "../chatStreamTypes";
import {
  consumePersistentTextStream,
  type SendMessageCallbacks,
  useSendMessage,
  useSetMessageFeedback,
  useSourceSuggestions,
} from "../services/chatApi";
import { useStartDeepResearch } from "../services/researchApi";
import {
  computeRemoteGenerationBlocksSend,
  isStreamStillRelevant,
  researchProgressToStreamingActivity,
  resolveConversationMessages,
  shouldResetStreamOnConversationChange,
} from "../utils/chatStreamHelpers";

interface UseChatStreamProps {
  activeNotebookId: string | null;
  activeConversationId: string | null;
  sources: Source[];
  documents: Doc<"documents">[];
  onConversationEnsured?: (conversationId: string) => void;
}

const SKEW_MS = 120_000;

/** A server generation lock older than this is treated as stuck (crashed or interrupted stream). */
const STALE_GENERATION_MS = 5 * 60 * 1000;

const RESEARCH_START_DETAIL = "Running approved research…";

const ACTIVITY_PHASES: ReadonlySet<string> = new Set<ChatActivityPhase>([
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
]);

/** Map a server status label to a phase the activity panel knows; anything else reads as thinking. */
function toActivityPhase(status: string): ChatActivityPhase {
  return ACTIVITY_PHASES.has(status) ? (status as ChatActivityPhase) : "thinking";
}

type TracePhase = { status: string; message: string };
type ResearchPlan = NonNullable<Message["researchPlan"]>;

interface StreamState {
  isStreaming: boolean;
  content: string;
  references: ReferenceChunk[] | null;
  /** The stream ended; its synthetic row stays until the persisted assistant message arrives. */
  justFinished: boolean;
  toolCalls: MessageToolCall[];
  tracePhases: TracePhase[];
  phase: ChatActivityPhase | null;
  phaseDetail: string | null;
  grounding: AgentGroundingCheck[];
  clarification: string | null;
  researchPlan: ResearchPlan | null;
}

const INITIAL_STREAM: StreamState = {
  isStreaming: false,
  content: "",
  references: null,
  justFinished: false,
  toolCalls: [],
  tracePhases: [],
  phase: null,
  phaseDetail: null,
  grounding: [],
  clarification: null,
  researchPlan: null,
};

/** Per-turn activity, cleared when a turn starts and when its synthetic row is replaced. */
const CLEARED_ACTIVITY = {
  toolCalls: [],
  tracePhases: [],
  phase: null,
  phaseDetail: null,
  grounding: [],
  clarification: null,
} satisfies Partial<StreamState>;

function appendTracePhase(prev: TracePhase[], status: string, message: string): TracePhase[] {
  const last = prev[prev.length - 1];
  if (last && last.status === status && last.message === message) return prev;
  return [...prev, { status, message }];
}

/** A persisted chat message row as `chat.messages.listByNotebook` returns it. */
type ChatMessageRow = Doc<"messages"> & {
  role: string;
  content: string;
  createdAt: number;
  references?: ReferenceChunk[];
  feedback?: "up" | "down";
  metadata?: unknown;
};

type PersistedMessageMeta = {
  agentTrace?: ChatAgentTrace;
  researchPlanId?: string;
  isResearchPlan?: boolean;
  externalSources?: ExternalSource[];
  isLiteratureReview?: boolean;
  isResearchResult?: boolean;
  researchRunId?: string;
  sessionId?: string;
  status?: string;
  query?: string;
  tableId?: string;
  reportId?: string;
  suggestedColumns?: NonNullable<Message["literatureReview"]>["suggestedColumns"];
  error?: string;
};

function toDisplayMessage(
  msg: ChatMessageRow,
  streamingResearchPlan: ResearchPlan | null
): Message {
  const meta = msg.metadata as PersistedMessageMeta | undefined;
  return {
    id: msg._id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    references: msg.references,
    feedback: msg.feedback,
    followUps: undefined,
    agentTrace: meta?.agentTrace,
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
}

export function useChatStream({
  activeNotebookId,
  activeConversationId,
  sources,
  documents,
  onConversationEnsured,
}: UseChatStreamProps) {
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const streamOwnerConversationIdRef = useRef<string | null>(null);

  const shouldApplyStreamUpdate = useCallback(() => {
    return isStreamStillRelevant(
      streamOwnerConversationIdRef.current,
      activeConversationIdRef.current
    );
  }, []);

  const chatBundle = useQuery(
    api.chat.messages.listByNotebook,
    activeNotebookId && activeNotebookId !== "new" && activeConversationId
      ? {
          notebookId: activeNotebookId as Id<"notebooks">,
          conversationId: activeConversationId as Id<"conversations">,
        }
      : "skip"
  );

  // The query validates messages as v.any(); rows are message docs.
  const messages = useMemo(
    () =>
      resolveConversationMessages(
        activeConversationId,
        chatBundle as { messages: ChatMessageRow[] } | undefined
      ),
    [activeConversationId, chatBundle]
  );
  const chatRemoteGenerating = chatBundle?.chatGenerating ?? false;

  /** True when server reports an in-flight generation and the DB still expects a reply (last row is not assistant). */
  const remoteGenerationBlocksSend = useMemo(
    () => computeRemoteGenerationBlocksSend(chatRemoteGenerating, messages),
    [chatRemoteGenerating, messages]
  );

  const deleteMessagesFromMutation = useMutation(api.chat.messages.deleteMessagesFrom);
  const releaseChatGenerationMutation = useMutation(api.chat.messages.releaseChatGeneration);
  const { sendMessage, stopChat: stopSendMessage } = useSendMessage();
  const startDeepResearch = useStartDeepResearch();
  const { handleLimitError } = useErrorToast();
  const setMessageFeedback = useSetMessageFeedback();

  const [stream, setStream] = useState<StreamState>(INITIAL_STREAM);
  const patchStream = useCallback(
    (patch: Partial<StreamState> | ((prev: StreamState) => Partial<StreamState>)) =>
      setStream((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })),
    []
  );
  const resetStream = useCallback(() => setStream(INITIAL_STREAM), []);
  const isChatStreaming = stream.isStreaming;

  const [lastAssistantFollowUps, setLastAssistantFollowUps] = useState<string[] | null>(null);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const messagesLengthWhenStreamCompleteRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const streamStartedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetStreamingState = useCallback(() => {
    resetStream();
    streamStartedAtRef.current = null;
  }, [resetStream]);

  // Reset streaming state when switching to a different conversation.
  // Do not abort when auto-select binds the thread we just created/sent on.
  useEffect(() => {
    if (
      !shouldResetStreamOnConversationChange(
        streamOwnerConversationIdRef.current,
        activeConversationId
      )
    ) {
      if (streamOwnerConversationIdRef.current == null && activeConversationId) {
        streamOwnerConversationIdRef.current = activeConversationId;
      }
      return;
    }
    // Abort any in-flight research stream for the previous conversation
    // so its callbacks do not leak into the new chat's UI state.
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    stopSendMessage();
    streamOwnerConversationIdRef.current = null;
    resetStreamingState();
    setExternalSources([]);
  }, [activeConversationId, resetStreamingState, stopSendMessage]);

  // Leaving the notebook unmounts the chat: abort in-flight streams like a thread switch does.
  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      stopSendMessage();
    },
    [stopSendMessage]
  );

  // Auto-release stale chat generations so "Generating in another tab" doesn't show forever
  // when a stream crashes or is interrupted. Only when we're not streaming locally and the last
  // message is already an assistant (generation lock stuck after persist).
  useEffect(() => {
    const startedAt = chatBundle?.chatGenerationStartedAt;
    if (isChatStreaming || !chatRemoteGenerating || !startedAt) return;
    const isWaitingForAssistant = messages[messages.length - 1]?.role !== "assistant";
    if (
      Date.now() - startedAt > STALE_GENERATION_MS &&
      !isWaitingForAssistant &&
      activeNotebookId
    ) {
      releaseChatGenerationMutation({
        notebookId: activeNotebookId as Id<"notebooks">,
      }).catch(() => {
        // Best-effort: if it fails, user can manually retry
      });
    }
  }, [
    isChatStreaming,
    chatRemoteGenerating,
    chatBundle?.chatGenerationStartedAt,
    messages,
    activeNotebookId,
    releaseChatGenerationMutation,
  ]);

  /**
   * Callbacks for one stream (chat send or approved-research execute). Every update is dropped
   * once the user has switched to another conversation.
   */
  const createStreamCallbacks = useCallback(
    (kind: "chat" | "research"): SendMessageCallbacks => {
      const guard =
        <A extends unknown[]>(fn: (...args: A) => void) =>
        (...args: A) => {
          if (shouldApplyStreamUpdate()) fn(...args);
        };
      const applyStatus = (status: string, message: string | undefined, traceStatus: string) =>
        patchStream((prev) => ({
          phase: toActivityPhase(status),
          phaseDetail: message ?? null,
          tracePhases: appendTracePhase(prev.tracePhases, traceStatus, message ?? ""),
        }));
      // Keep trace, tool calls, phase, and grounding until the synthetic __streaming__ row is
      // removed (content cleared after the persisted assistant message arrives). Clearing them
      // here left a gap where the panel showed empty toolCalls and looked broken.
      const finish = () => {
        patchStream({ isStreaming: false, justFinished: true });
        streamStartedAtRef.current = null;
        abortControllerRef.current = null;
      };

      const callbacks: SendMessageCallbacks = {
        onToken: guard((token: string) =>
          patchStream((prev) => ({ content: prev.content + token }))
        ),
        onReferences: guard((references: ReferenceChunk[]) => patchStream({ references })),
        // Chat traces keep the server's status label; research traces store the mapped phase.
        onStatus: guard((status: string, message?: string) =>
          applyStatus(status, message, kind === "chat" ? status : toActivityPhase(status))
        ),
        onResearchProgress: guard((progress) => {
          const { phase, detail } = researchProgressToStreamingActivity(progress);
          applyStatus(phase, detail, toActivityPhase(phase));
        }),
        onToolCalls: guard((toolCalls: MessageToolCall[]) => patchStream({ toolCalls })),
        onGroundingChecks: guard((grounding: AgentGroundingCheck[]) => patchStream({ grounding })),
        onComplete: guard(() => {
          const len = messagesRef.current.length;
          messagesLengthWhenStreamCompleteRef.current = len > 0 ? len : -1;
          finish();
        }),
        onStopped: guard(finish),
        onError: guard(() => {
          resetStreamingState();
          abortControllerRef.current = null;
        }),
      };
      if (kind === "research") return callbacks;

      return {
        ...callbacks,
        onClarification: guard((clarification: string) => patchStream({ clarification })),
        onResearchPlan: guard((researchPlan: ResearchPlan) => patchStream({ researchPlan })),
        onFollowUps: guard((followUps: string[]) => setLastAssistantFollowUps(followUps)),
        onExternalSources: guard((found: ExternalSource[]) => setExternalSources(found)),
        onConversationReady: (conversationId) => {
          streamOwnerConversationIdRef.current = conversationId;
          onConversationEnsured?.(conversationId);
        },
      };
    },
    [shouldApplyStreamUpdate, patchStream, resetStreamingState, onConversationEnsured]
  );

  const handleSendMessage = useCallback(
    async (
      messageText: string,
      deepResearch?: boolean,
      sourcePolicy?: ChatStreamSourcePolicy,
      sendOptions?: { documentIdsOverride?: string[] }
    ) => {
      if (!activeNotebookId || isChatStreaming) return;
      if (chatRemoteGenerating) {
        const last = messagesRef.current.at(-1);
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
      streamOwnerConversationIdRef.current = activeConversationId;
      const hasNotebookSearch = sourcePolicy?.channels?.includes("notebook") ?? true;
      const override = sendOptions?.documentIdsOverride;
      const selectedDocumentIds = !hasNotebookSearch
        ? []
        : override && override.length > 0
          ? override
          : sourcesRef.current.filter((source) => source.selected).map((source) => source.id);

      patchStream({ ...CLEARED_ACTIVITY, isStreaming: true, content: "", references: null });
      setLastAssistantFollowUps(null);
      setExternalSources([]);

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
        } catch (err) {
          resetStreamingState();
          // Pro-only and usage-limit refusals get the upgrade toast.
          await handleLimitError(err);
        } finally {
          patchStream({ isStreaming: false });
        }
        return;
      }

      try {
        abortControllerRef.current = new AbortController();
        await sendMessage(
          activeNotebookId,
          messageText,
          createStreamCallbacks("chat"),
          selectedDocumentIds,
          deepResearch,
          sourcePolicy,
          activeConversationId ?? undefined
        );
      } catch {
        resetStreamingState();
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
      handleLimitError,
      patchStream,
      resetStreamingState,
      createStreamCallbacks,
    ]
  );

  // The persisted assistant message arrived: drop the synthetic streaming row.
  useEffect(() => {
    const refLen = messagesLengthWhenStreamCompleteRef.current;
    if (
      stream.justFinished &&
      (messages.length >= refLen || refLen < 0) &&
      messages[messages.length - 1]?.role === "assistant"
    ) {
      patchStream({
        ...CLEARED_ACTIVITY,
        content: "",
        references: null,
        justFinished: false,
        researchPlan: null,
      });
    }
  }, [stream.justFinished, messages, patchStream]);

  // The persisted answer matches what we streamed: stop streaming before __DONE arrives.
  useEffect(() => {
    if (!stream.isStreaming || !stream.content.trim()) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || !last.content) return;
    if (last.content.trimEnd() !== stream.content.trimEnd()) return;

    patchStream({ ...CLEARED_ACTIVITY, isStreaming: false, justFinished: true });
    messagesLengthWhenStreamCompleteRef.current = messages.length - 1;
  }, [stream.isStreaming, stream.content, messages, patchStream]);

  // An answer for this turn was persisted while no tokens reached us: show it, not a ghost row.
  useEffect(() => {
    if (!stream.isStreaming || stream.content.trim()) return;
    const t0 = streamStartedAtRef.current;
    if (t0 == null) return;
    const n = messages.length;
    if (n < 2) return;
    const assistant = messages[n - 1];
    const user = messages[n - 2];
    if (assistant?.role !== "assistant" || user?.role !== "user") return;
    const assistantText =
      typeof assistant.content === "string" ? assistant.content : String(assistant.content ?? "");
    if (!assistantText.trim()) return;
    if (typeof assistant.createdAt !== "number" || assistant.createdAt < t0 - SKEW_MS) return;

    resetStreamingState();
  }, [stream.isStreaming, stream.content, messages, resetStreamingState]);

  // Persisted rows are rebuilt only when the query result changes, so streamed tokens leave
  // their objects (and the memoized bubbles) alone.
  const persistedRows = useMemo(
    () => messages.map((msg) => toDisplayMessage(msg, stream.researchPlan)),
    [messages, stream.researchPlan]
  );

  const hasStreamingContent = stream.content !== "";
  const rowsWithFollowUps = useMemo(() => {
    const last = persistedRows[persistedRows.length - 1];
    if (hasStreamingContent || !lastAssistantFollowUps || last?.role !== "assistant") {
      return persistedRows;
    }
    return [...persistedRows.slice(0, -1), { ...last, followUps: lastAssistantFollowUps }];
  }, [persistedRows, hasStreamingContent, lastAssistantFollowUps]);

  const chatDisplayMessages = useMemo((): Message[] => {
    const {
      isStreaming,
      content,
      references,
      toolCalls,
      tracePhases,
      phase,
      phaseDetail,
      grounding,
      clarification,
    } = stream;
    const t0 = streamStartedAtRef.current;
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    const lastAssistantText =
      last?.content == null
        ? ""
        : typeof last.content === "string"
          ? last.content
          : String(last.content);
    const ghostStuckAssistantRow =
      isStreaming &&
      !content.trim() &&
      t0 != null &&
      last?.role === "assistant" &&
      prev?.role === "user" &&
      !!lastAssistantText.trim() &&
      typeof last.createdAt === "number" &&
      last.createdAt >= t0 - SKEW_MS;

    const list = [...rowsWithFollowUps];

    if ((isStreaming || content || clarification) && !ghostStuckAssistantRow) {
      const toolSearching = toolCalls.some((t) => t.status === "searching");
      let phaseForRow: ChatActivityPhase | undefined = clarification
        ? "completed"
        : (phase ?? (toolSearching ? "searching" : content.trim() ? "writing" : "thinking"));
      if (content.trim() && !toolSearching && !clarification) {
        if (
          phaseForRow === "generating" ||
          phaseForRow === "thinking" ||
          phaseForRow === "reading"
        ) {
          phaseForRow = "writing";
        }
      }
      const hasTrace = tracePhases.length > 0 || toolCalls.length > 0 || grounding.length > 0;
      list.push({
        id: "__streaming__",
        role: "assistant",
        content: clarification ? `**Could you clarify?**\n\n${clarification}` : content,
        timestamp: new Date(),
        references: references ?? undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        groundingChecks: grounding.length > 0 ? grounding : undefined,
        agentTrace: hasTrace ? { phases: tracePhases, toolCalls, grounding } : undefined,
        status: phaseForRow,
        statusDetail:
          clarification || phaseForRow === "writing" ? undefined : (phaseDetail ?? undefined),
        clarificationQuestion: clarification ?? undefined,
        externalSources: externalSources.length > 0 ? externalSources : undefined,
      });
    }

    const showRemoteOnlyPlaceholder =
      chatRemoteGenerating &&
      !isStreaming &&
      !content.trim() &&
      !clarification &&
      !ghostStuckAssistantRow &&
      last?.role === "user";

    if (showRemoteOnlyPlaceholder) {
      list.push({
        id: "__remote_generating__",
        role: "assistant",
        content: "",
        timestamp: new Date(),
        status: "thinking",
        statusDetail: "Searching...",
      });
    }

    return list;
  }, [messages, rowsWithFollowUps, stream, externalSources, chatRemoteGenerating]);

  // Retry reads the latest rows through a ref so its identity survives streamed tokens.
  const chatDisplayMessagesRef = useRef(chatDisplayMessages);
  chatDisplayMessagesRef.current = chatDisplayMessages;

  const handleRetryMessage = useCallback(
    async (assistantMessageId: string) => {
      if (isChatStreaming || remoteGenerationBlocksSend) return;
      const rows = chatDisplayMessagesRef.current;
      const idx = rows.findIndex((m) => m.id === assistantMessageId);
      if (idx < 0) return;

      let userContent = "";
      let userMessageId: string | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (rows[i].role === "user") {
          userContent = rows[i].content;
          userMessageId = rows[i].id;
          break;
        }
      }
      if (!userContent || !userMessageId) return;

      await deleteMessagesFromMutation({ messageId: userMessageId as Id<"messages"> });
      handleSendMessage(userContent);
    },
    [isChatStreaming, remoteGenerationBlocksSend, handleSendMessage, deleteMessagesFromMutation]
  );

  // Central stop function that aborts both regular chat and research streams
  const stopChat = useCallback(() => {
    // Abort the shared abort controller (used by research stream)
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
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
    () => documents.filter((d) => d.status === "completed").length,
    [documents]
  );

  const consumeResearchExecuteStream = useCallback(
    async (response: Response) => {
      if (isChatStreaming) return;

      streamOwnerConversationIdRef.current = activeConversationId;
      patchStream({
        ...CLEARED_ACTIVITY,
        isStreaming: true,
        content: "",
        references: null,
        phase: "planning",
        phaseDetail: RESEARCH_START_DETAIL,
        tracePhases: [{ status: "planning", message: RESEARCH_START_DETAIL }],
      });
      streamStartedAtRef.current = Date.now();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await consumePersistentTextStream(
          response,
          createStreamCallbacks("research"),
          controller.signal
        );
      } catch {
        resetStreamingState();
        abortControllerRef.current = null;
        throw new Error("Research stream failed");
      }
    },
    [isChatStreaming, activeConversationId, patchStream, resetStreamingState, createStreamCallbacks]
  );

  return {
    chatDisplayMessages,
    isChatStreaming,
    remoteGenerationBlocksSend,
    handleSendMessage,
    setMessageFeedback,
    handleRetryMessage,
    consumeResearchExecuteStream,
    stopChat,
    sourceCount,
    sourceSummary: sourceSuggestions.summary,
    suggestions: sourceSuggestions.suggestions,
    isLoadingSuggestions: sourceSuggestions.isLoading,
  };
}
