import { useCallback, useMemo } from "react";
import type { ChatSessionContextType } from "../useChatStreaming";
import type { useChatStream } from "./useChatStream";
import type { useConversationCRUD } from "./useConversationCRUD";

interface UseChatSessionValueArgs {
  chatStream: ReturnType<typeof useChatStream>;
  conversationCRUD: ReturnType<typeof useConversationCRUD>;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

/**
 * The chat session context value (everything but `messages`). It is built from the individual
 * fields of `chatStream`, never the object itself, which is new on every render: that is what
 * keeps the value, and every session consumer, unchanged while a reply streams.
 */
export function useChatSessionValue({
  chatStream,
  conversationCRUD,
  activeConversationId,
  setActiveConversationId,
}: UseChatSessionValueArgs): ChatSessionContextType {
  const {
    isChatStreaming,
    remoteChatGenerating,
    remoteGenerationBlocksSend,
    handleSendMessage,
    stopChat,
    consumeResearchExecuteStream,
    handleClearChatHistory,
    setMessageFeedback,
    handleRetryMessage,
    setOptimisticSaveNote,
    externalSources,
    clearExternalSources,
    sourceCount,
    sourceSummary,
    suggestions,
    isLoadingSuggestions,
  } = chatStream;
  const { conversations, handleCreate, handleRename, handleDelete } = conversationCRUD;

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const wasOnlyThread =
        conversations != null && conversations.length === 1 && conversations[0]._id === id;
      await handleDelete(id);
      if (wasOnlyThread) {
        const newId = await handleCreate();
        setActiveConversationId(newId ?? null);
        return;
      }
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [conversations, handleDelete, handleCreate, activeConversationId, setActiveConversationId]
  );

  return useMemo(
    () => ({
      isChatStreaming,
      remoteChatGenerating,
      remoteGenerationBlocksSend,
      onSendMessage: handleSendMessage,
      onStopChat: stopChat,
      consumeResearchExecuteStream,
      onClearHistory: handleClearChatHistory,
      onSetFeedback: setMessageFeedback,
      onRetry: handleRetryMessage,
      onSaveChatOptimistic: setOptimisticSaveNote,
      externalSources,
      clearExternalSources,
      sourceCount,
      sourceSummary,
      suggestions,
      isLoadingSuggestions,
      activeConversationId,
      conversations,
      onSelectConversation: setActiveConversationId,
      onCreateConversation: handleCreate,
      onRenameConversation: handleRename,
      onDeleteConversation: handleDeleteConversation,
    }),
    [
      isChatStreaming,
      remoteChatGenerating,
      remoteGenerationBlocksSend,
      handleSendMessage,
      stopChat,
      consumeResearchExecuteStream,
      handleClearChatHistory,
      setMessageFeedback,
      handleRetryMessage,
      setOptimisticSaveNote,
      externalSources,
      clearExternalSources,
      sourceCount,
      sourceSummary,
      suggestions,
      isLoadingSuggestions,
      activeConversationId,
      conversations,
      setActiveConversationId,
      handleCreate,
      handleRename,
      handleDeleteConversation,
    ]
  );
}
