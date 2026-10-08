// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SendMessageCallbacks } from "../services/chatStream";
import { useChatStream } from "./useChatStream";

const h = vi.hoisted(() => ({
  sendCallbacks: null as SendMessageCallbacks | null,
  researchCallbacks: null as SendMessageCallbacks | null,
  mutation: () => Promise.resolve(null),
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({ messages: [], chatGenerating: false }),
  useMutation: () => h.mutation,
}));

vi.mock("../services/chatApi", () => {
  const sendMessage = (_notebookId: string, _text: string, callbacks: SendMessageCallbacks) => {
    h.sendCallbacks = callbacks;
    return new Promise<void>(() => {});
  };
  const stopChat = () => {};
  const setFeedback = () => Promise.resolve(null);
  const suggestions = { summary: null, suggestions: null, isLoading: false };
  return {
    useSendMessage: () => ({ sendMessage, stopChat }),
    useSetMessageFeedback: () => setFeedback,
    useSourceSuggestions: () => suggestions,
    consumePersistentTextStream: (_response: Response, callbacks: SendMessageCallbacks) => {
      h.researchCallbacks = callbacks;
      return new Promise<void>(() => {});
    },
  };
});

vi.mock("../services/researchApi", () => ({ useStartDeepResearch: () => h.mutation }));

vi.mock("@/shared/hooks/useLimitErrorToast", () => {
  const handleLimitError = () => Promise.resolve(false);
  return { useLimitErrorToast: () => ({ handleLimitError }) };
});

/** A hand-cranked `requestAnimationFrame`: callbacks run only when the test flushes a frame. */
function stubAnimationFrames() {
  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue.delete(id);
  });
  return {
    flushFrame() {
      const callbacks = [...queue.values()];
      queue.clear();
      act(() => {
        for (const cb of callbacks) cb(performance.now());
      });
    },
  };
}

const NO_SOURCES: never[] = [];

function renderChatStream(initialConversationId = "c1") {
  let renders = 0;
  const hook = renderHook(
    ({ conversationId }: { conversationId: string }) => {
      renders++;
      return useChatStream({
        activeNotebookId: "nb1",
        activeConversationId: conversationId,
        sources: NO_SOURCES,
        notes: NO_SOURCES,
        documents: NO_SOURCES,
      });
    },
    { initialProps: { conversationId: initialConversationId } }
  );
  return { ...hook, renderCount: () => renders };
}

function streamingRow(result: { current: ReturnType<typeof useChatStream> }) {
  return result.current.chatDisplayMessages.find((m) => m.id === "__streaming__");
}

const TOKENS = Array.from({ length: 50 }, (_, i) => `t${i} `);
const FULL_TEXT = TOKENS.join("");

describe("useChatStream token batching", () => {
  let frames: ReturnType<typeof stubAnimationFrames>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    frames = stubAnimationFrames();
    h.sendCallbacks = null;
    h.researchCallbacks = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function startChat(result: { current: ReturnType<typeof useChatStream> }) {
    act(() => {
      void result.current.handleSendMessage("hello");
    });
    const callbacks = h.sendCallbacks;
    if (!callbacks) throw new Error("sendMessage was not called");
    return callbacks;
  }

  test("tokens within one frame produce a single state update", () => {
    const { result, renderCount } = renderChatStream();
    const callbacks = startChat(result);
    const before = renderCount();

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
    });
    expect(renderCount()).toBe(before);
    expect(streamingRow(result)?.content).toBe("");

    frames.flushFrame();
    expect(renderCount()).toBe(before + 1);
    expect(streamingRow(result)?.content).toBe(FULL_TEXT);
  });

  test("falls back to a timeout when no animation frame arrives (background tab)", () => {
    const { result } = renderChatStream();
    const callbacks = startChat(result);

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
    });
    expect(streamingRow(result)?.content).toBe("");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(streamingRow(result)?.content).toBe(FULL_TEXT);
  });

  test("complete flushes buffered tokens synchronously", () => {
    const { result } = renderChatStream();
    const callbacks = startChat(result);

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
      callbacks.onComplete?.();
    });

    expect(result.current.isChatStreaming).toBe(false);
    expect(streamingRow(result)?.content).toBe(FULL_TEXT);
  });

  test("stop flushes buffered tokens synchronously", () => {
    const { result } = renderChatStream();
    const callbacks = startChat(result);

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
      callbacks.onStopped?.();
    });

    expect(result.current.isChatStreaming).toBe(false);
    expect(streamingRow(result)?.content).toBe(FULL_TEXT);
  });

  test("error drops buffered tokens with the rest of the stream state", () => {
    const { result } = renderChatStream();
    const callbacks = startChat(result);

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
      callbacks.onError("boom");
    });
    frames.flushFrame();
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.isChatStreaming).toBe(false);
    expect(streamingRow(result)).toBeUndefined();
  });

  test("buffered tokens do not leak into another conversation", () => {
    const { result, rerender } = renderChatStream("c1");
    const callbacks = startChat(result);

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
    });
    rerender({ conversationId: "c2" });
    act(() => {
      callbacks.onToken("late ");
    });
    frames.flushFrame();
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.isChatStreaming).toBe(false);
    expect(streamingRow(result)).toBeUndefined();
  });

  test("the research stream batches tokens the same way", async () => {
    const { result, renderCount } = renderChatStream();
    act(() => {
      void result.current.consumeResearchExecuteStream(new Response(""));
    });
    const callbacks = h.researchCallbacks;
    if (!callbacks) throw new Error("research stream was not consumed");
    const before = renderCount();

    act(() => {
      for (const token of TOKENS) callbacks.onToken(token);
    });
    expect(renderCount()).toBe(before);

    frames.flushFrame();
    expect(renderCount()).toBe(before + 1);
    expect(streamingRow(result)?.content).toBe(FULL_TEXT);

    act(() => {
      callbacks.onToken("tail");
      callbacks.onComplete?.();
    });
    expect(result.current.isChatStreaming).toBe(false);
    expect(streamingRow(result)?.content).toBe(`${FULL_TEXT}tail`);
  });

  test("returned actions keep their identity across streamed tokens", () => {
    const { result } = renderChatStream();
    const callbacks = startChat(result);
    const first = result.current;

    act(() => {
      callbacks.onToken("a");
    });
    frames.flushFrame();
    act(() => {
      callbacks.onComplete?.();
    });

    const next = result.current;
    expect(next.handleSendMessage).toBe(first.handleSendMessage);
    expect(next.handleRetryMessage).toBe(first.handleRetryMessage);
    expect(next.consumeResearchExecuteStream).toBe(first.consumeResearchExecuteStream);
    expect(next.handleClearChatHistory).toBe(first.handleClearChatHistory);
    expect(next.stopChat).toBe(first.stopChat);
    expect(next.clearExternalSources).toBe(first.clearExternalSources);
    expect(next.setMessageFeedback).toBe(first.setMessageFeedback);
    expect(next.setOptimisticSaveNote).toBe(first.setOptimisticSaveNote);
  });
});
