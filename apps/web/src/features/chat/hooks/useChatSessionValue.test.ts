// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Message } from "@/shared/types/index";
import { useChatSessionValue } from "./useChatSessionValue";
import type { useChatStream } from "./useChatStream";

type ChatStream = ReturnType<typeof useChatStream>;

const NO_SOURCES: ChatStream["externalSources"] = [];

function makeChatStream(messages: Message[], overrides: Partial<ChatStream> = {}): ChatStream {
  return {
    ...baseChatStream,
    chatDisplayMessages: messages,
    ...overrides,
  };
}

const baseChatStream: ChatStream = {
  chatDisplayMessages: [],
  isChatStreaming: true,
  remoteChatGenerating: false,
  remoteGenerationBlocksSend: false,
  displayNotes: [],
  addPendingStudioNote: vi.fn(),
  updatePendingStudioNote: vi.fn(),
  removePendingStudioNote: vi.fn(),
  handleSendMessage: vi.fn(),
  handleClearChatHistory: vi.fn(),
  setMessageFeedback: vi.fn(),
  handleRetryMessage: vi.fn(),
  setOptimisticSaveNote: vi.fn(),
  consumeResearchExecuteStream: vi.fn(),
  stopChat: vi.fn(),
  sourceCount: 2,
  sourceSummary: null,
  suggestions: null,
  isLoadingSuggestions: false,
  externalSources: NO_SOURCES,
  clearExternalSources: vi.fn(),
};

function streamingMessage(content: string): Message {
  return { id: "__streaming__", role: "assistant", content, timestamp: new Date(0) };
}

function conversationCRUD(conversations: Array<{ _id: string }>) {
  return {
    conversations,
    handleCreate: vi.fn(async () => "new-thread"),
    handleRename: vi.fn(async () => {}),
    handleDelete: vi.fn(async () => {}),
  } as unknown as Parameters<typeof useChatSessionValue>[0]["conversationCRUD"];
}

describe("useChatSessionValue", () => {
  test("keeps its identity while only the streamed message list changes", () => {
    const crud = conversationCRUD([{ _id: "c1" }]);
    const setActive = vi.fn();
    const { result, rerender } = renderHook(
      ({ chatStream }: { chatStream: ChatStream }) =>
        useChatSessionValue({
          chatStream,
          conversationCRUD: crud,
          activeConversationId: "c1",
          setActiveConversationId: setActive,
        }),
      { initialProps: { chatStream: makeChatStream([streamingMessage("a")]) } }
    );
    const first = result.current;

    for (let i = 0; i < 20; i++) {
      rerender({ chatStream: makeChatStream([streamingMessage(`a${"b".repeat(i)}`)]) });
      expect(result.current).toBe(first);
    }

    rerender({ chatStream: makeChatStream([], { isChatStreaming: false }) });
    expect(result.current).not.toBe(first);
    expect(result.current.isChatStreaming).toBe(false);
  });

  test("deleting the only thread creates and selects a new one", async () => {
    const crud = conversationCRUD([{ _id: "c1" }]);
    const setActive = vi.fn();
    const { result } = renderHook(() =>
      useChatSessionValue({
        chatStream: baseChatStream,
        conversationCRUD: crud,
        activeConversationId: "c1",
        setActiveConversationId: setActive,
      })
    );

    await act(() => result.current.onDeleteConversation("c1"));

    expect(crud.handleDelete).toHaveBeenCalledWith("c1");
    expect(crud.handleCreate).toHaveBeenCalled();
    expect(setActive).toHaveBeenCalledWith("new-thread");
  });

  test("deleting the active thread among several clears the selection", async () => {
    const crud = conversationCRUD([{ _id: "c1" }, { _id: "c2" }]);
    const setActive = vi.fn();
    const { result } = renderHook(() =>
      useChatSessionValue({
        chatStream: baseChatStream,
        conversationCRUD: crud,
        activeConversationId: "c2",
        setActiveConversationId: setActive,
      })
    );

    await act(() => result.current.onDeleteConversation("c2"));

    expect(crud.handleCreate).not.toHaveBeenCalled();
    expect(setActive).toHaveBeenCalledWith(null);
  });
});
