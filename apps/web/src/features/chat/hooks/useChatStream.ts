import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id, type Doc } from '@convex/_generated/dataModel';
import { Source, Note, Message, MessageToolCall } from '@/shared/types/index';
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

  const messages = useQuery(
    api.chat.messages.listByNotebook,
    activeNotebookId && activeNotebookId !== 'new'
      ? { notebookId: activeNotebookId as Id<'notebooks'> }
      : 'skip'
  ) ?? [];

  const clearChatHistoryMutation = useMutation(api.chat.messages.clearHistory);
  const deleteMessagesFromMutation = useMutation(api.chat.messages.deleteMessagesFrom);
  const sendChatMessage = useSendMessage();
  const setMessageFeedback = useSetMessageFeedback();

  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReferences, setStreamingReferences] = useState<unknown[] | null>(null);
  const [streamingJustFinished, setStreamingJustFinished] = useState(false);
  const [streamingToolCalls, setStreamingToolCalls] = useState<MessageToolCall[]>([]);
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
    streamStartedAtRef.current = null;
  }, []);

  const handleSendMessage = useCallback(async (messageText: string) => {
    if (!activeNotebookId || isChatStreaming) return;

    streamStartedAtRef.current = Date.now();
    setIsChatStreaming(true);
    setStreamingContent('');
    setStreamingReferences(null);
    const selectedDocumentIds = sourcesRef.current
      .filter((source) => source.selected)
      .map((source) => source.id);

    setStreamingToolCalls([]);
    setLastAssistantFollowUps(null);

    const onStreamComplete = () => {
      setIsChatStreaming(false);
      setStreamingJustFinished(true);
      setStreamingToolCalls([]);
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
          onStatus: () => {},
          onToolCall: (tc) => setStreamingToolCalls((prev) => {
            const existing = prev.findIndex((c) => c.query === tc.query && c.tool === tc.tool);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = tc;
              return next;
            }
            return [...prev, tc];
          }),
          onFollowUps: (qs) => setLastAssistantFollowUps(qs),
          onComplete: onStreamComplete,
          onError: resetStreamingState,
        },
        selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined
      );
    } catch {
      resetStreamingState();
    }
  }, [activeNotebookId, isChatStreaming, sendChatMessage, resetStreamingState]);

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
    }
  }, [streamingJustFinished, messages]);

  useEffect(() => {
    if (!isChatStreaming || !streamingContent.trim()) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant' || !last.content) return;
    if (last.content.trimEnd() !== streamingContent.trimEnd()) return;

    setIsChatStreaming(false);
    setStreamingToolCalls([]);
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
    const list: Message[] = messages.map((msg: Doc<'messages'>, index: number) => ({
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
    }));
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

    if ((isChatStreaming || streamingContent) && !ghostStuckAssistantRow) {
      list.push({
        id: '__streaming__',
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date(),
        references: (streamingReferences as Message['references']) ?? undefined,
        toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
        status: streamingContent ? undefined : 'thinking',
      });
    }
    return list;
  }, [messages, streamingContent, streamingReferences, streamingToolCalls, lastAssistantFollowUps, isChatStreaming]);

  const handleRetryMessage = useCallback(async (assistantMessageId: string) => {
    if (isChatStreaming) return;
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
  }, [chatDisplayMessages, isChatStreaming, handleSendMessage, deleteMessagesFromMutation]);

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
