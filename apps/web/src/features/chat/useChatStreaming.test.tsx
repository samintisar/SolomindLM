import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Message } from "@/shared/types/index";
import { ChatStreamingProvider } from "./ChatStreamingContext";
import {
  type ChatSessionContextType,
  useChatSessionContext,
  useChatStreamingContext,
} from "./useChatStreaming";

const session: ChatSessionContextType = {
  isChatStreaming: false,
  remoteChatGenerating: false,
  remoteGenerationBlocksSend: false,
  onSendMessage: () => {},
  onStopChat: () => {},
  consumeResearchExecuteStream: async () => {},
  onClearHistory: () => {},
  onSetFeedback: () => {},
  onRetry: () => {},
  onSaveChatOptimistic: () => {},
  externalSources: [],
  clearExternalSources: () => {},
  sourceCount: 0,
  sourceSummary: null,
  suggestions: null,
  isLoadingSuggestions: false,
  activeConversationId: null,
  conversations: undefined,
  onSelectConversation: () => {},
  onCreateConversation: async () => null,
  onRenameConversation: async () => {},
  onDeleteConversation: async () => {},
};

function message(id: string): Message {
  return { id, role: "assistant", content: id, timestamp: new Date(0) };
}

function wrapperFor(props: { messages: Message[] }) {
  return ({ children }: { children: ReactNode }) => (
    <ChatStreamingProvider session={session} messages={props.messages}>
      {children}
    </ChatStreamingProvider>
  );
}

describe("useChatStreamingContext", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useChatStreamingContext())).toThrow(
      "useChatStreamingContext must be used within ChatStreamingProvider"
    );
    expect(() => renderHook(() => useChatSessionContext())).toThrow(
      "useChatSessionContext must be used within ChatStreamingProvider"
    );
  });

  it("merges the session and the message list", () => {
    const messages = [message("a")];
    const { result } = renderHook(() => useChatStreamingContext(), {
      wrapper: wrapperFor({ messages }),
    });
    expect(result.current).toEqual({ ...session, messages });
  });

  it("keeps the session value stable while only messages change", () => {
    const props = { messages: [message("a")] };
    const wrapper = ({ children }: { children: ReactNode }) => wrapperFor(props)({ children });
    const { result, rerender } = renderHook(
      () => ({ session: useChatSessionContext(), full: useChatStreamingContext() }),
      { wrapper }
    );
    const first = result.current;

    props.messages = [message("a"), message("b")];
    rerender();

    expect(result.current.session).toBe(first.session);
    expect(result.current.full).not.toBe(first.full);
    expect(result.current.full.messages).toBe(props.messages);
  });
});
