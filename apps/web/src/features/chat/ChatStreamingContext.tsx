import { createContext, useContext, ReactNode } from 'react';
import { Message, Note } from '@/shared/types/index';

export interface ChatStreamingContextType {
  messages: Message[];
  isChatStreaming: boolean;
  onSendMessage: (messageText: string) => void;
  onClearHistory: () => void;
  onSetFeedback: (messageId: string, feedback: 'up' | 'down' | null) => void;
  onRetry: (assistantMessageId: string) => void;
  onSaveChatOptimistic: (payload: { notebookId: string; note: Note } | null) => void;
  sourceCount: number;
  sourceSummary: string | null;
  suggestions: string[] | null;
  isLoadingSuggestions: boolean;
}

const ChatStreamingContext = createContext<ChatStreamingContextType | undefined>(undefined);

interface ChatStreamingProviderProps {
  children: ReactNode;
  value: ChatStreamingContextType;
}

export function ChatStreamingProvider({ children, value }: ChatStreamingProviderProps) {
  return (
    <ChatStreamingContext.Provider value={value}>
      {children}
    </ChatStreamingContext.Provider>
  );
}

export function useChatStreamingContext() {
  const context = useContext(ChatStreamingContext);
  if (!context) throw new Error('useChatStreamingContext must be used within ChatStreamingProvider');
  return context;
}
