import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useAudioPlayerContext } from "@/features/audio/useAudioPlayer";
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
vi.mock("@/features/studio/useStudioContext", () => ({
  useStudioContext: () => ({ notes: [{ id: "note-1", title: "First", type: "audioOverview" }] }),
}));
vi.mock("@/features/chat/useChatStreaming", () => ({
  useChatSessionContext: () => ({
    onSendMessage: vi.fn(),
    isChatStreaming: false,
    remoteGenerationBlocksSend: false,
  }),
}));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock("@/features/sources/components/SourcesPanel", () => ({ SourcesPanel: () => null }));
vi.mock("@/features/chat/components/ChatPanel", () => ({ ChatPanel: () => null }));
vi.mock("@/features/studio/components/LiteraturePapersPanel", () => ({
  LiteraturePapersPanel: () => null,
}));
vi.mock("@/features/studio/components/LiteratureScreeningPanel", () => ({
  LiteratureScreeningPanel: () => null,
}));
vi.mock("@/features/studio/components/LiteratureStudioView", () => ({
  LiteratureStudioView: () => null,
}));
// A probe in StudioPanel's place: it drives the audio context the way the real panel does.
vi.mock("@/features/studio/components/StudioPanel", () => ({
  StudioPanel: function AudioProbe() {
    const { miniPlayerVisible, miniPlayerData, onPlayAudio, onExpandAudioPlayer } =
      useAudioPlayerContext();
    return (
      <div data-testid="audio-probe">
        <output data-testid="mini-note-id">{miniPlayerData?.noteId ?? ""}</output>
        <output data-testid="mini-visible">{String(miniPlayerVisible)}</output>
        <button
          type="button"
          onClick={() =>
            onPlayAudio("https://example.test/a.mp3", "First", "Host: Hi.", "note-1", "note-1")
          }
        >
          Play
        </button>
        <button type="button" onClick={onExpandAudioPlayer}>
          Expand
        </button>
      </div>
    );
  },
}));

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/notebook/n1"]}>
      <NotebookView />
    </MemoryRouter>
  );
}

describe("NotebookView audio player", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("playing a note keeps its id in miniPlayerData", async () => {
    const user = userEvent.setup();
    renderView();

    // Every mounted Studio column reads the same context, so any probe will do.
    await user.click(screen.getAllByRole("button", { name: "Play" })[0]);

    expect(screen.getAllByTestId("mini-note-id")[0]).toHaveTextContent("note-1");
    expect(screen.getAllByTestId("mini-visible")[0]).toHaveTextContent("true");
    expect(window).not.toHaveProperty("__currentPlayingAudioNoteId");
  });

  test("expand closes the mini player and opens the playing note", async () => {
    const user = userEvent.setup();
    const dispatch = vi.spyOn(window, "dispatchEvent");
    renderView();

    await user.click(screen.getAllByRole("button", { name: "Play" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Expand" })[0]);

    expect(screen.getAllByTestId("mini-visible")[0]).toHaveTextContent("false");
    const opened = dispatch.mock.calls
      .map(([event]) => event)
      .filter((event): event is CustomEvent => event.type === "setActiveNote");
    expect(opened).toHaveLength(1);
    expect(opened[0].detail).toEqual({ noteId: "note-1" });
  });
});
