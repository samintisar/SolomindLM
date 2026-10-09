import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NotebookView } from "./NotebookView";

vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/features/notebooks/useNotebookContext", () => ({
  useNotebookContext: () => ({
    urlNotebookId: "n1",
    notebookTitle: "Notebook",
    activeNotebook: null,
  }),
}));
vi.mock("@/features/sources/useSourcesContext", () => ({
  useSourcesContext: () => ({ sources: [] }),
}));
vi.mock("@/features/studio/useStudioContext", () => ({ useStudioContext: () => ({ notes: [] }) }));
vi.mock("@/features/chat/useChatStreaming", () => ({
  useChatSessionContext: () => ({
    onSendMessage: vi.fn(),
    isChatStreaming: false,
    remoteGenerationBlocksSend: false,
  }),
}));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock("@/features/sources/components/SourcesPanel", () => ({
  SourcesPanel: ({
    focusSourceRequest,
    onFocusSourceHandled,
  }: {
    focusSourceRequest?: unknown;
    onFocusSourceHandled?: () => void;
  }) => (
    <div data-testid="sources-panel" data-focus={JSON.stringify(focusSourceRequest ?? null)}>
      <button type="button" onClick={onFocusSourceHandled}>
        focus handled
      </button>
    </div>
  ),
}));
vi.mock("@/features/chat/components/ChatPanel", () => ({
  ChatPanel: ({
    onOpenNotebookSource,
  }: {
    onOpenNotebookSource?: (
      documentId: string,
      focus?: { quote?: string; pageNumber?: number | null }
    ) => void;
  }) => (
    <div data-testid="chat-panel">
      <button
        type="button"
        onClick={() => onOpenNotebookSource?.("doc1", { quote: "the passage", pageNumber: 7 })}
      >
        open citation
      </button>
    </div>
  ),
}));
vi.mock("@/features/studio/components/StudioPanel", () => ({
  StudioPanel: () => <div data-testid="studio-panel" />,
}));
vi.mock("@/features/studio/components/LiteraturePapersPanel", () => ({
  LiteraturePapersPanel: () => null,
}));
vi.mock("@/features/studio/components/LiteratureScreeningPanel", () => ({
  LiteratureScreeningPanel: () => null,
}));
vi.mock("@/features/studio/components/LiteratureStudioView", () => ({
  LiteratureStudioView: () => null,
}));

/** A controllable `matchMedia`: `setDesktop` flips the viewport and fires `change`. */
function mockViewport(initiallyDesktop: boolean) {
  let matches = initiallyDesktop;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    setDesktop(next: boolean) {
      matches = next;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/notebook/n1"]}>
      <NotebookView />
    </MemoryRouter>
  );
}

describe("NotebookView layout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("desktop mounts one set of panels and no mobile tabs", () => {
    mockViewport(true);
    renderView();

    expect(screen.getAllByTestId("sources-panel")).toHaveLength(1);
    expect(screen.getAllByTestId("chat-panel")).toHaveLength(1);
    expect(screen.getAllByTestId("studio-panel")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Sources" })).not.toBeInTheDocument();
  });

  test("mobile mounts only the active tab's panel", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    renderView();

    expect(screen.getAllByTestId("sources-panel")).toHaveLength(1);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("studio-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.queryByTestId("sources-panel")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("chat-panel")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Studio" }));
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("studio-panel")).toHaveLength(1);
  });

  test("crossing the breakpoint swaps layouts instead of stacking them", () => {
    const viewport = mockViewport(true);
    renderView();
    expect(screen.getAllByTestId("chat-panel")).toHaveLength(1);

    viewport.setDesktop(false);
    expect(screen.getByRole("button", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getAllByTestId("sources-panel")).toHaveLength(1);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();

    viewport.setDesktop(true);
    expect(screen.queryByRole("button", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("sources-panel")).toHaveLength(1);
    expect(screen.getAllByTestId("chat-panel")).toHaveLength(1);
  });

  test("a citation click carries its passage and page into the source focus request", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    renderView();
    const focusOf = () => JSON.parse(screen.getByTestId("sources-panel").dataset.focus ?? "null");

    await user.click(screen.getByRole("button", { name: "open citation" }));
    expect(focusOf()).toEqual({ documentId: "doc1", seq: 1, quote: "the passage", pageNumber: 7 });

    // The panel clears the request once handled; a repeat click must still be a new focus.
    await user.click(screen.getByRole("button", { name: "focus handled" }));
    expect(focusOf()).toBeNull();
    await user.click(screen.getByRole("button", { name: "open citation" }));
    expect(focusOf()).toMatchObject({ documentId: "doc1", seq: 2 });
  });
});
