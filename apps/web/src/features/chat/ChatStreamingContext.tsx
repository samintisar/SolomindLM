import { ReactNode } from "react";
import { Message } from "@/shared/types/index";
import {
  ChatMessagesContext,
  ChatSessionContext,
  ChatSessionContextType,
} from "./useChatStreaming";

interface ChatStreamingProviderProps {
  children: ReactNode;
  /** Actions and stream status; keep it referentially stable while tokens stream. */
  session: ChatSessionContextType;
  messages: Message[];
}

/**
 * Provides the chat context as two halves so a streamed token only re-renders the components
 * that read `messages` (see `useChatSessionContext` vs `useChatStreamingContext`).
 */
export function ChatStreamingProvider({ children, session, messages }: ChatStreamingProviderProps) {
  return (
    <ChatSessionContext.Provider value={session}>
      <ChatMessagesContext.Provider value={messages}>{children}</ChatMessagesContext.Provider>
    </ChatSessionContext.Provider>
  );
}
