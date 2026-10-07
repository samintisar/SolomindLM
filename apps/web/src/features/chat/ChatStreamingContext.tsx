import type { Doc } from "@convex/_generated/dataModel";
import { type ReactNode, useMemo } from "react";
import type { Source } from "@/shared/types/index";
import { useChatStream } from "./hooks/useChatStream";
import {
  ChatMessagesContext,
  ChatStreamingContext,
  type ChatStreamingContextType,
} from "./useChatStreaming";

type ConversationControls = Pick<
  ChatStreamingContextType,
  | "activeConversationId"
  | "conversations"
  | "onSelectConversation"
  | "onCreateConversation"
  | "onRenameConversation"
  | "onDeleteConversation"
  | "onSaveChatOptimistic"
>;

interface ChatStreamingProviderProps extends ConversationControls {
  children: ReactNode;
  activeNotebookId: string | null;
  sources: Source[];
  documents: Doc<"documents">[];
}

/**
 * Owns the chat stream state, so streamed tokens re-render this provider and the message-list
 * consumers only — not the app shell or the rest of the notebook view. Pass stable callbacks.
 */
export function ChatStreamingProvider({
  children,
  activeNotebookId,
  sources,
  documents,
  activeConversationId,
  conversations,
  onSelectConversation,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onSaveChatOptimistic,
}: ChatStreamingProviderProps) {
  const {
    chatDisplayMessages,
    isChatStreaming,
    remoteGenerationBlocksSend,
    handleSendMessage,
    stopChat,
    consumeResearchExecuteStream,
    setMessageFeedback,
    handleRetryMessage,
    sourceCount,
    sourceSummary,
    suggestions,
    isLoadingSuggestions,
  } = useChatStream({
    activeNotebookId,
    activeConversationId,
    sources,
    documents,
    onConversationEnsured: onSelectConversation,
  });

  const controls = useMemo(
    (): ChatStreamingContextType => ({
      isChatStreaming,
      remoteGenerationBlocksSend,
      onSendMessage: handleSendMessage,
      onStopChat: stopChat,
      consumeResearchExecuteStream,
      onSetFeedback: setMessageFeedback,
      onRetry: handleRetryMessage,
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
    }),
    [
      isChatStreaming,
      remoteGenerationBlocksSend,
      handleSendMessage,
      stopChat,
      consumeResearchExecuteStream,
      setMessageFeedback,
      handleRetryMessage,
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
    ]
  );

  return (
    <ChatStreamingContext.Provider value={controls}>
      <ChatMessagesContext.Provider value={chatDisplayMessages}>
        {children}
      </ChatMessagesContext.Provider>
    </ChatStreamingContext.Provider>
  );
}
