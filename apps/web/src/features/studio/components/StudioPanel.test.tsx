import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPlayerContext, type AudioPlayerContextType } from "@/features/audio/useAudioPlayer";
import type { Note } from "@/shared/types/index";
import { StudioPanel } from "./StudioPanel";

function audioOverview(id: string, title: string): Note {
  return {
    id,
    title,
    preview: "",
    type: "audioOverview",
    audioUrl: `https://example.test/${id}.mp3`,
    transcript: "Host: Hello.",
    status: "completed",
  };
}

const notes: Note[] = [audioOverview("note-1", "First"), audioOverview("note-2", "Second")];

vi.mock("../useStudioContext", () => ({
  useStudioContext: () => ({
    notes,
    onUpdateNote: vi.fn(),
    onUpdateNoteFull: vi.fn(),
    onDeleteNote: vi.fn(),
    onAddNote: vi.fn(),
    onSaveReportContent: vi.fn(),
  }),
}));
vi.mock("../services/notesApi", () => ({
  useNoteDetail: (_type: string | null, id: string | null) => ({
    note: notes.find((n) => n.id === id) ?? null,
    isLoading: false,
  }),
}));
vi.mock("../hooks/useNoteActions", () => ({
  useNoteActions: () => ({ editingId: null, editTitle: "", handleEditCancel: vi.fn() }),
}));
vi.mock("../hooks/useStudioHandlers", () => ({ useStudioHandlers: () => ({}) }));
vi.mock("@/shared/ui/useConfirmDialog", () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(), ConfirmDialogComponent: () => null }),
}));
vi.mock("@/features/audio/components/MiniAudioPlayer", () => ({
  MiniAudioPlayer: ({ title }: { title?: string }) => <div data-testid="mini-player">{title}</div>,
}));
vi.mock("./ActiveNoteView", () => ({
  ActiveNoteView: ({ activeNote }: { activeNote: Note }) => (
    <div data-testid="full-player">{activeNote.id}</div>
  ),
}));
vi.mock("./NoteListView", () => ({
  NoteListView: ({ notes, onNoteClick }: { notes: Note[]; onNoteClick: (n: Note) => void }) => (
    <ul>
      {notes.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => onNoteClick(n)}>
            Open {n.title}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("./StudioPanelHeader", () => ({ StudioPanelHeader: () => null }));
vi.mock("./CustomizeAudioModal", () => ({ CustomizeAudioModal: () => null }));
vi.mock("./CustomizeFlashcardsModal", () => ({ CustomizeFlashcardsModal: () => null }));
vi.mock("./CustomizeInfographicModal", () => ({ CustomizeInfographicModal: () => null }));
vi.mock("./CustomizeMindMapModal", () => ({ CustomizeMindMapModal: () => null }));
vi.mock("./CustomizeQuizModal", () => ({ CustomizeQuizModal: () => null }));
vi.mock("./CustomizeReportModal", () => ({ CustomizeReportModal: () => null }));
vi.mock("./CustomizeSpreadsheetsModal", () => ({ CustomizeSpreadsheetsModal: () => null }));
vi.mock("./CustomizeWrittenQuestionsModal", () => ({
  CustomizeWrittenQuestionsModal: () => null,
}));

const onCloseMiniPlayer = vi.fn();

/** The mini player is playing note-1; the context stays fixed so only StudioPanel decides. */
function renderPanel() {
  const audio: AudioPlayerContextType = {
    miniPlayerVisible: true,
    miniPlayerData: {
      audioUrl: "https://example.test/note-1.mp3",
      title: "First",
      noteId: "note-1",
      audioOverviewId: "note-1",
    },
    onPlayAudio: vi.fn(),
    onCloseMiniPlayer,
    onExpandAudioPlayer: vi.fn(),
  };
  return render(
    <AudioPlayerContext.Provider value={audio}>
      <StudioPanel isOpen onClose={vi.fn()} tools={[]} />
    </AudioPlayerContext.Provider>
  );
}

describe("StudioPanel mini player", () => {
  beforeEach(() => {
    onCloseMiniPlayer.mockClear();
  });

  it("shows the mini player while the note list is open", () => {
    renderPanel();
    expect(screen.getByTestId("mini-player")).toHaveTextContent("First");
  });

  it("hides the mini player when its note is opened in the full player", () => {
    renderPanel();
    // The Expand path: NotebookView closes the mini player itself, then selects the note.
    act(() => {
      window.dispatchEvent(new CustomEvent("setActiveNote", { detail: { noteId: "note-1" } }));
    });

    expect(screen.getByTestId("full-player")).toHaveTextContent("note-1");
    expect(screen.queryByTestId("mini-player")).not.toBeInTheDocument();
  });

  it("closes the mini player when the user opens its note from the list", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Open First" }));

    expect(onCloseMiniPlayer).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("mini-player")).not.toBeInTheDocument();
  });

  it("keeps the mini player when a different note is opened", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Open Second" }));

    expect(screen.getByTestId("full-player")).toHaveTextContent("note-2");
    expect(screen.getByTestId("mini-player")).toBeInTheDocument();
    expect(onCloseMiniPlayer).not.toHaveBeenCalled();
  });
});
