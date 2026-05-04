import { ReactNode } from "react";
import { ChatStreamingContext, ChatStreamingContextType } from "./useChatStreaming";

interface ChatStreamingProviderProps {
  children: ReactNode;
  value: ChatStreamingContextType;
}

export function ChatStreamingProvider({ children, value }: ChatStreamingProviderProps) {
  return <ChatStreamingContext.Provider value={value}>{children}</ChatStreamingContext.Provider>;
}
