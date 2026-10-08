import type { Doc } from "@convex/_generated/dataModel";
import { createContext, useContext, useMemo } from "react";
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

/**
 * Everything in the chat context except the message list. It changes at stream boundaries
 * (start, finish, conversation switch), not per streamed token, so components that only need
 * to send or know whether a reply is in flight subscribe to this one.
 */
export type ChatSessionContextType = Omit<ChatStreamingContextType, "messages">;

export const ChatSessionContext = createContext<ChatSessionContextType | undefined>(undefined);

/** The displayed message list, including the in-progress streaming row. Changes per frame while streaming. */
export const ChatMessagesContext = createContext<Message[] | undefined>(undefined);

const PROVIDER_ERROR = "must be used within ChatStreamingProvider";

/** Chat actions and stream status without the message list: no re-render per streamed token. */
export function useChatSessionContext(): ChatSessionContextType {
  const session = useContext(ChatSessionContext);
  if (!session) throw new Error(`useChatSessionContext ${PROVIDER_ERROR}`);
  return session;
}

/** The full chat context, messages included. Re-renders the caller on every streamed frame. */
export function useChatStreamingContext(): ChatStreamingContextType {
  const session = useContext(ChatSessionContext);
  const messages = useContext(ChatMessagesContext);
  const value = useMemo(
    () => (session && messages ? { ...session, messages } : undefined),
    [session, messages]
  );
  if (!value) throw new Error(`useChatStreamingContext ${PROVIDER_ERROR}`);
  return value;
}
