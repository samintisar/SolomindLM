import { render } from "@testing-library/react";
import { memo } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ChatStreamingProvider } from "@/features/chat/ChatStreamingContext";
import {
  type ChatSessionContextType,
  useChatStreamingContext,
} from "@/features/chat/useChatStreaming";
import type { Message } from "@/shared/types/index";
import { NotebookView } from "./NotebookView";

/**
 * Streams tokens into the real chat providers the way `AppContent` does (the root re-renders and
 * hands `NotebookView` a fresh element each frame) and counts panel renders (#418).
 */

const renders = vi.hoisted(() => ({ sources: 0, chat: 0, studio: 0, lastChatContent: "" }));

const stable = vi.hoisted(() => ({
  auth: { user: { id: "u1" } },
  notebook: { urlNotebookId: "n1", notebookTitle: "Notebook", activeNotebook: null },
  sources: { sources: [] },
  studio: { notes: [] },
  toast: { error: () => {} },
}));

vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => stable.auth }));
vi.mock("@/features/notebooks/useNotebookContext", () => ({
  useNotebookContext: () => stable.notebook,
}));
vi.mock("@/features/sources/useSourcesContext", () => ({
  useSourcesContext: () => stable.sources,
}));
vi.mock("@/features/studio/useStudioContext", () => ({ useStudioContext: () => stable.studio }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => stable.toast }));

// Stand-ins with the same shape as the real exports: memoized components. The chat stand-in
// reads the full chat context, like the real ChatPanel.
vi.mock("@/features/sources/components/SourcesPanel", () => ({
  SourcesPanel: memo(() => {
    renders.sources++;
    return null;
  }),
}));
vi.mock("@/features/studio/components/StudioPanel", () => ({
  StudioPanel: memo(() => {
    renders.studio++;
    return null;
  }),
}));
vi.mock("@/features/chat/components/ChatPanel", () => ({
  ChatPanel: memo(() => {
    renders.chat++;
    renders.lastChatContent = useChatStreamingContext().messages.at(-1)?.content ?? "";
    return null;
  }),
}));

const session: ChatSessionContextType = {
  isChatStreaming: true,
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
  activeConversationId: "c1",
  conversations: undefined,
  onSelectConversation: () => {},
  onCreateConversation: async () => null,
  onRenameConversation: async () => {},
  onDeleteConversation: async () => {},
};

function streamingRow(content: string): Message[] {
  return [{ id: "__streaming__", role: "assistant", content, timestamp: new Date(0) }];
}

/** Mirrors the notebook route in App.tsx: providers plus a fresh `<NotebookView />` element. */
function notebookRoute(chat: ChatSessionContextType, messages: Message[]) {
  return (
    <MemoryRouter initialEntries={["/notebook/n1"]}>
      <ChatStreamingProvider session={chat} messages={messages}>
        <NotebookView />
      </ChatStreamingProvider>
    </MemoryRouter>
  );
}

const TOKEN_COUNT = 40;

describe("NotebookView render scope while a reply streams", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renders.sources = 0;
    renders.chat = 0;
    renders.studio = 0;
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("streamed tokens re-render the chat panel only", () => {
    const { rerender } = render(notebookRoute(session, streamingRow("")));
    const mounted = { ...renders };

    let content = "";
    for (let i = 0; i < TOKEN_COUNT; i++) {
      content += `t${i} `;
      rerender(notebookRoute(session, streamingRow(content)));
    }

    expect(renders.sources - mounted.sources).toBe(0);
    expect(renders.studio - mounted.studio).toBe(0);
    expect(renders.chat - mounted.chat).toBe(TOKEN_COUNT);
    expect(renders.lastChatContent).toBe(content);
  });

  test("starting and finishing a reply does not re-render the sources or studio panel", () => {
    const messages = streamingRow("done");
    const { rerender } = render(notebookRoute({ ...session, isChatStreaming: false }, messages));
    const mounted = { ...renders };

    rerender(notebookRoute({ ...session, isChatStreaming: true }, messages));
    rerender(notebookRoute({ ...session, isChatStreaming: false }, messages));

    expect(renders.sources - mounted.sources).toBe(0);
    expect(renders.studio - mounted.studio).toBe(0);
  });
});
