import type { Doc } from "@convex/_generated/dataModel";
import { createContext, useContext } from "react";
import { Message, Note } from "@/shared/types/index";

import type { ChatStreamSourcePolicy } from "./chatStreamTypes";

export interface ChatStreamingContextType {
  messages: Message[];
  isChatStreaming: boolean;
  /** Assistant response in progress on the server (may be streaming in another tab/device). */
  remoteChatGenerating: boolean;
  /** When true, block starting a new message (last DB row is not assistant while server refcount > 0). */
  remoteGenerationBlocksSend: boolean;
  onSendMessage: (
    messageText: string,
    deepResearch?: boolean,
    sourcePolicy?: ChatStreamSourcePolicy,
    sendOptions?: { documentIdsOverride?: string[] }
  ) => void;
  /** Stop the current streaming response */
  onStopChat: () => void;
  /** Attach UI to the HTTP body from POST /research/execute (same markers as chat stream). */
  consumeResearchExecuteStream: (response: Response) => Promise<void>;
  onClearHistory: () => void;
  onSetFeedback: (messageId: string, feedback: "up" | "down" | null) => void;
  onRetry: (assistantMessageId: string) => void;
  onSaveChatOptimistic: (payload: { notebookId: string; note: Note } | null) => void;
  externalSources: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    score?: number;
  }>;
  clearExternalSources: () => void;
  sourceCount: number;
  sourceSummary: string | null;
  suggestions: string[] | null;
  isLoadingSuggestions: boolean;
  activeConversationId: string | null;
  conversations: Doc<"conversations">[] | undefined;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => Promise<string | null>;
  onRenameConversation: (id: string, title: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
}

export const ChatStreamingContext = createContext<ChatStreamingContextType | undefined>(undefined);

export function useChatStreamingContext() {
  const context = useContext(ChatStreamingContext);
  if (!context)
    throw new Error("useChatStreamingContext must be used within ChatStreamingProvider");
  return context;
}
