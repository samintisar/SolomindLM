import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { ChatStreamingContext, useChatStreamingContext } from "./useChatStreaming";

describe("useChatStreamingContext", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useChatStreamingContext())).toThrow(
      "useChatStreamingContext must be used within ChatStreamingProvider"
    );
  });

  it("returns context value when inside provider", () => {
    const value = {
      messages: [],
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

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatStreamingContext.Provider value={value}>{children}</ChatStreamingContext.Provider>
    );

    const { result } = renderHook(() => useChatStreamingContext(), { wrapper });
    expect(result.current).toBe(value);
  });
});
