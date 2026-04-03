import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id, type Doc } from '@convex/_generated/dataModel';
import {
  Source,
  Note,
  Message,
  MessageToolCall,
  AgentGroundingCheck,
  ChatActivityPhase,
  ChatAgentTrace,
} from '@/shared/types/index';
import { useSendMessage, useSetMessageFeedback, useSourceSuggestions } from '../services/chatApi';

interface UseChatStreamProps {
  activeNotebookId: string | null;
  sources: Source[];
  notes: Note[];
  documents: Doc<'documents'>[];
}

const SKEW_MS = 120_000;

export function useChatStream({ activeNotebookId, sources, notes, documents }: UseChatStreamProps) {
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const chatBundle = useQuery(
    api.chat.messages.listByNotebook,
    activeNotebookId && activeNotebookId !== 'new'
      ? { notebookId: activeNotebookId as Id<'notebooks'> }
      : 'skip'
  );

  const messages = chatBundle?.messages ?? [];
  const chatRemoteGenerating = chatBundle?.chatGenerating ?? false;

  const clearChatHistoryMutation = useMutation(api.chat.messages.clearHistory);
  const deleteMessagesFromMutation = useMutation(api.chat.messages.deleteMessagesFrom);
  const sendChatMessage = useSendMessage();
  const setMessageFeedback = useSetMessageFeedback();

  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
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
  const messagesLengthWhenStreamCompleteRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const streamStartedAtRef = useRef<number | null>(null);

  const [optimisticSaveNote, setOptimisticSaveNote] = useState<{ notebookId: string; note: Note } | null>(null);
  const displayNotes = useMemo(() => {
    if (!optimisticSaveNote || optimisticSaveNote.notebookId !== activeNotebookId) return notes;
    return [optimisticSaveNote.note, ...notes];
  }, [notes, optimisticSaveNote, activeNotebookId]);

  const resetStreamingState = useCallback(() => {
    setIsChatStreaming(false);
    setStreamingContent('');
    setStreamingReferences(null);
    setStreamingJustFinished(false);
    setStreamingToolCalls([]);
    setStreamingTracePhases([]);
    setStreamingPhase(null);
    setStreamingPhaseDetail(null);
    setStreamingGrounding([]);
    setStreamingClarification(null);
    streamStartedAtRef.current = null;
  }, []);

  const handleSendMessage = useCallback(async (messageText: string) => {
    if (!activeNotebookId || isChatStreaming || chatRemoteGenerating) return;

    streamStartedAtRef.current = Date.now();
    setIsChatStreaming(true);
    setStreamingContent('');
    setStreamingReferences(null);
    const selectedDocumentIds = sourcesRef.current
      .filter((source) => source.selected)
      .map((source) => source.id);

    setStreamingToolCalls([]);
    setStreamingTracePhases([]);
    setStreamingPhase(null);
    setStreamingPhaseDetail(null);
    setStreamingGrounding([]);
    setStreamingClarification(null);
    setLastAssistantFollowUps(null);

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

    try {
      await sendChatMessage(
        activeNotebookId,
        messageText,
        {
          onToken: (token) => setStreamingContent((prev) => prev + token),
          onReferences: (refs) => setStreamingReferences(refs),
          onStatus: (status, message) => {
            const allowed: ChatActivityPhase[] = [
              'searching',
              'reading',
              'thinking',
              'generating',
              'writing',
              'retrieving',
              'embedding',
              'ranking',
              'completed',
            ];
            if (allowed.includes(status as ChatActivityPhase)) {
              setStreamingPhase(status as ChatActivityPhase);
            } else {
              setStreamingPhase('thinking');
            }
            setStreamingPhaseDetail(message ?? null);
            const msg = message ?? '';
            setStreamingTracePhases((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.status === status && last.message === msg) return prev;
              return [...prev, { status, message: msg }];
            });
          },
          onToolCalls: (tcs) => setStreamingToolCalls(tcs),
          onGroundingChecks: (checks) => setStreamingGrounding(checks),
          onClarification: (q) => setStreamingClarification(q),
          onFollowUps: (qs) => setLastAssistantFollowUps(qs),
          onComplete: onStreamComplete,
          onError: resetStreamingState,
        },
        selectedDocumentIds.length > 0 ? selectedDocumentIds : []
      );
    } catch {
      resetStreamingState();
    }
  }, [activeNotebookId, isChatStreaming, chatRemoteGenerating, sendChatMessage, resetStreamingState]);

  const handleClearChatHistory = useCallback(async () => {
    if (!activeNotebookId || activeNotebookId === 'new') return;
    try {
      await clearChatHistoryMutation({
        notebookId: activeNotebookId as Id<'notebooks'>,
      });
      resetStreamingState();
    } catch (error) {
      console.error('Failed to clear chat history', error);
      resetStreamingState();
    }
  }, [activeNotebookId, clearChatHistoryMutation, resetStreamingState]);

  useEffect(() => {
    const refLen = messagesLengthWhenStreamCompleteRef.current;
    if (
      streamingJustFinished &&
      (messages.length >= refLen || refLen < 0) &&
      messages[messages.length - 1]?.role === 'assistant'
    ) {
      setStreamingContent('');
      setStreamingReferences(null);
      setStreamingJustFinished(false);
      setStreamingToolCalls([]);
      setStreamingTracePhases([]);
      setStreamingPhase(null);
      setStreamingPhaseDetail(null);
      setStreamingGrounding([]);
      setStreamingClarification(null);
    }
  }, [streamingJustFinished, messages]);

  useEffect(() => {
    if (!isChatStreaming || !streamingContent.trim()) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant' || !last.content) return;
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
    const assistant = messages[n - 1] as Doc<'messages'>;
    const user = messages[n - 2] as Doc<'messages'>;
    if (assistant?.role !== 'assistant' || user?.role !== 'user') return;
    const assistantText =
      typeof assistant.content === 'string' ? assistant.content : String(assistant.content ?? '');
    if (!assistantText.trim()) return;
    if (typeof assistant.createdAt !== 'number' || assistant.createdAt < t0 - SKEW_MS) return;

    resetStreamingState();
  }, [isChatStreaming, streamingContent, messages, resetStreamingState]);

  const chatDisplayMessages = useMemo((): Message[] => {
    const list: Message[] = messages.map((msg: Doc<'messages'>, index: number) => {
      const meta = (msg as Doc<'messages'> & { metadata?: { agentTrace?: ChatAgentTrace } }).metadata;
      const trace = meta?.agentTrace;
      return {
        id: msg._id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.createdAt as number),
        references: msg.references,
        feedback: (msg as any).feedback as 'up' | 'down' | undefined,
        followUps: (
          !streamingContent &&
          msg.role === 'assistant' &&
          index === messages.length - 1 &&
          lastAssistantFollowUps
        ) ? lastAssistantFollowUps : undefined,
        agentTrace: trace,
      };
    });
    const t0 = streamStartedAtRef.current;
    const last = messages[messages.length - 1] as Doc<'messages'> | undefined;
    const prev = messages[messages.length - 2] as Doc<'messages'> | undefined;
    const lastAssistantText =
      last?.content == null
        ? ''
        : typeof last.content === 'string'
          ? last.content
          : String(last.content);
    const ghostStuckAssistantRow =
      isChatStreaming &&
      !streamingContent.trim() &&
      t0 != null &&
      last?.role === 'assistant' &&
      prev?.role === 'user' &&
      !!lastAssistantText.trim() &&
      typeof last.createdAt === 'number' &&
      last.createdAt >= t0 - SKEW_MS;

    if ((isChatStreaming || streamingContent || streamingClarification) && !ghostStuckAssistantRow) {
      const toolSearching = streamingToolCalls.some((t) => t.status === 'searching');
      let phaseForRow: ChatActivityPhase | undefined =
        streamingPhase ??
        (toolSearching ? 'searching' : streamingContent.trim() ? 'writing' : 'thinking');
      if (streamingContent.trim() && !toolSearching) {
        const p = phaseForRow;
        if (p === 'generating' || p === 'thinking' || p === 'reading') {
          phaseForRow = 'writing';
        }
      }
      const statusDetailForRow =
        phaseForRow === 'writing' ? undefined : (streamingPhaseDetail ?? undefined);
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
        id: '__streaming__',
        role: 'assistant',
        content: streamingClarification
          ? `**Could you clarify?**\n\n${streamingClarification}`
          : streamingContent,
        timestamp: new Date(),
        references: (streamingReferences as Message['references']) ?? undefined,
        toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
        groundingChecks: streamingGrounding.length > 0 ? streamingGrounding : undefined,
        agentTrace: streamingTrace,
        status: phaseForRow,
        statusDetail: statusDetailForRow,
        clarificationQuestion: streamingClarification ?? undefined,
      });
    }

    const showRemoteOnlyPlaceholder =
      chatRemoteGenerating &&
      !isChatStreaming &&
      !streamingContent.trim() &&
      !streamingClarification &&
      !ghostStuckAssistantRow;

    if (showRemoteOnlyPlaceholder) {
      const lastMsg = messages[messages.length - 1] as Doc<'messages'> | undefined;
      if (lastMsg?.role === 'user') {
        list.push({
          id: '__remote_generating__',
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          status: 'thinking',
          statusDetail:
            'Generating a response… This may be streaming in another tab or device. Detailed tool steps appear in the tab that sent the message.',
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
    lastAssistantFollowUps,
    isChatStreaming,
    chatRemoteGenerating,
  ]);

  const handleRetryMessage = useCallback(async (assistantMessageId: string) => {
    if (isChatStreaming || chatRemoteGenerating) return;
    const idx = chatDisplayMessages.findIndex((m) => m.id === assistantMessageId);
    if (idx < 0) return;

    let userContent = '';
    let userMessageId: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (chatDisplayMessages[i].role === 'user') {
        userContent = chatDisplayMessages[i].content;
        userMessageId = chatDisplayMessages[i].id;
        break;
      }
    }
    if (!userContent || !userMessageId) return;

    await deleteMessagesFromMutation({ messageId: userMessageId as Id<'messages'> });
    handleSendMessage(userContent);
  }, [chatDisplayMessages, isChatStreaming, chatRemoteGenerating, handleSendMessage, deleteMessagesFromMutation]);

  const sourceSuggestions = useSourceSuggestions(
    activeNotebookId && activeNotebookId !== 'new' ? activeNotebookId : null,
    documents
  );
  const sourceCount = useMemo(
    () => documents.filter((d: any) => d.status === 'completed').length,
    [documents]
  );

  return {
    chatDisplayMessages,
    isChatStreaming,
    remoteChatGenerating: chatRemoteGenerating,
    displayNotes,
    handleSendMessage,
    handleClearChatHistory,
    setMessageFeedback,
    handleRetryMessage,
    setOptimisticSaveNote,
    sourceCount,
    sourceSummary: sourceSuggestions.summary,
    suggestions: sourceSuggestions.suggestions,
    isLoadingSuggestions: sourceSuggestions.isLoading,
  };
}
