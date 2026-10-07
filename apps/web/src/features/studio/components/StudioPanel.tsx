import { Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { MiniAudioPlayer } from "@/features/audio/components/MiniAudioPlayer";
import { useAudioPlayerContext } from "@/features/audio/useAudioPlayerContext";
import { isAudioOverviewNote, isInfographicNote, Note, StudioTool } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { useNoteActions } from "../hooks/useNoteActions";
import { useStudioHandlers } from "../hooks/useStudioHandlers";
import { useNoteDetail } from "../services/notesApi";
import { useStudioContext } from "../useStudioContext";
import { ActiveNoteView } from "./ActiveNoteView";
import { CustomizeAudioModal } from "./CustomizeAudioModal";
import { CustomizeFlashcardsModal } from "./CustomizeFlashcardsModal";
import { CustomizeInfographicModal } from "./CustomizeInfographicModal";
import { CustomizeMindMapModal } from "./CustomizeMindMapModal";
import { CustomizeQuizModal } from "./CustomizeQuizModal";
import { CustomizeReportModal } from "./CustomizeReportModal";
import { CustomizeSpreadsheetsModal } from "./CustomizeSpreadsheetsModal";
import { CustomizeWrittenQuestionsModal } from "./CustomizeWrittenQuestionsModal";
import { NoteListView } from "./NoteListView";
import { StudioPanelHeader } from "./StudioPanelHeader";
import type { InfographicViewControls } from "./views/InfographicView";

function isShowingExpandedAudioPlayer(note: Note): boolean {
  return isAudioOverviewNote(note) && note.status === "completed" && Boolean(note.audioUrl?.trim());
}

interface StudioPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tools: StudioTool[];
  sources?: any[];
  notebookId?: string | null;
  onAskInChat?: (prompt: string, documentIds?: string[]) => void;
}

/**
 * StudioPanel component - Main studio creation and notes panel.
 * Refactored to use sub-components for better maintainability.
 */
export const StudioPanel: React.FC<StudioPanelProps> = ({
  isOpen,
  onClose,
  tools,
  sources = [],
  notebookId,
  onAskInChat,
}) => {
  const { notes, onUpdateNote, onUpdateNoteFull, onDeleteNote, onAddNote, onSaveReportContent } =
    useStudioContext();

  const { miniPlayerVisible, miniPlayerData, onPlayAudio, onCloseMiniPlayer, onExpandAudioPlayer } =
    useAudioPlayerContext();

  // State
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isEditingReportContent, setIsEditingReportContent] = useState(false);
  const [isInfographicFullscreen, setIsInfographicFullscreen] = useState(false);
  const infographicControlsRef = useRef<InfographicViewControls | null>(null);

  // Derived state — list rows are summaries; load full content when opening a saved note.
  const listNote = notes.find((n) => n.id === activeNoteId) ?? null;
  const shouldLoadFullNote = Boolean(listNote && listNote.status !== "generating");
  const { note: fetchedNote, isLoading: isLoadingFullNote } = useNoteDetail(
    shouldLoadFullNote ? listNote!.type : null,
    shouldLoadFullNote ? activeNoteId : null
  );
  const detailLoadFailed = shouldLoadFullNote && !isLoadingFullNote && fetchedNote === null;
  const activeNote = fetchedNote ?? (shouldLoadFullNote ? null : listNote);
  const headerNote = listNote ?? fetchedNote;

  useEffect(() => {
    if (detailLoadFailed) {
      setActiveNoteId(null);
      setIsEditingReportContent(false);
    }
  }, [detailLoadFailed]);

  const expandedSameNoteHidesMini =
    isOpen &&
    !!activeNote &&
    !!miniPlayerData?.noteId &&
    miniPlayerData.noteId === activeNote.id &&
    isShowingExpandedAudioPlayer(activeNote);

  const showDockedMiniPlayer = !!(
    miniPlayerVisible &&
    miniPlayerData &&
    !expandedSameNoteHidesMini
  );

  const canDownloadInfographic =
    !!activeNote &&
    isInfographicNote(activeNote) &&
    activeNote.status !== "generating" &&
    activeNote.status !== "failed" &&
    Boolean(activeNote.imageUrl?.trim());

  const handleInfographicControlsRegister = useCallback(
    (controls: InfographicViewControls | null) => {
      infographicControlsRef.current = controls;
    },
    []
  );

  useEffect(() => {
    if (!activeNote || !isInfographicNote(activeNote)) {
      infographicControlsRef.current = null;
      setIsInfographicFullscreen(false);
    }
  }, [activeNote]);

  // Other parts of the app open a note here with a `setActiveNote` window event.
  const onSetActiveNoteEvent = useEffectEvent((event: Event) => {
    const noteId = (event as CustomEvent).detail?.noteId;
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    // Allow selecting notes not yet in the list (e.g. right after first save)
    if (!note || note.status !== "generating") {
      setActiveNoteId(noteId);
    }
  });
  useEffect(() => {
    const handleSetActiveNote = (event: Event) => onSetActiveNoteEvent(event);
    window.addEventListener("setActiveNote", handleSetActiveNote);
    return () => window.removeEventListener("setActiveNote", handleSetActiveNote);
  }, []);

  // Confirm dialog
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Note actions hook (edit, copy, download, delete, export)
  const noteActions = useNoteActions({
    activeNote,
    onUpdateNote,
    onDeleteNote,
    confirm,
  });

  // Studio handlers hook (modals, creation flows)
  const { openTool, closeTool, handleToolClick, create } = useStudioHandlers({
    sources,
    notebookId,
    onAddNote,
    onUpdateNoteFull,
    onDeleteNote,
    confirm,
  });

  // Open a saved note (generating rows aren't openable yet)
  const handleNoteClick = (note: Note) => {
    if (note.status !== "generating") setActiveNoteId(note.id);
  };

  // Handle play audio from note item
  const handlePlayAudioFromNote = (note: Note) => {
    if (isAudioOverviewNote(note) && note.audioUrl) {
      onPlayAudio?.(note.audioUrl, note.title, note.transcript, note.id, note.id);
    }
  };

  // Handle rename from header
  const handleRenameSubmit = (id: string, newTitle: string) => {
    onUpdateNote(id, newTitle);
    noteActions.handleEditCancel();
  };

  // Handle edit start from header
  const handleEditStartFromHeader = () => {
    if (activeNote) {
      noteActions.handleStartEdit(activeNote);
    }
  };

  // Handle back button
  const handleBack = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    setIsInfographicFullscreen(false);
    setActiveNoteId(null);
    setIsEditingReportContent(false);
  };

  const handleEditReport = () => setIsEditingReportContent(true);

  const handleSaveReportContent = async (reportId: string, content: string) => {
    await onSaveReportContent?.(reportId, content);
    setIsEditingReportContent(false);
  };

  const handleCancelEditReport = () => setIsEditingReportContent(false);

  if (!isOpen) {
    return (
      <>
        {showDockedMiniPlayer && (
          <MiniAudioPlayer
            audioUrl={miniPlayerData.audioUrl}
            audioOverviewId={miniPlayerData.audioOverviewId}
            title={miniPlayerData.title}
            transcript={miniPlayerData.transcript}
            isVisible={miniPlayerVisible}
            onClose={onCloseMiniPlayer || (() => undefined)}
            onExpand={onExpandAudioPlayer || (() => undefined)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="relative h-full w-full min-w-0 bg-sidebar flex flex-col overflow-hidden">
        {/* Header */}
        <StudioPanelHeader
          activeNote={activeNoteId ? headerNote : null}
          onBack={handleBack}
          onClose={onClose}
          editingId={noteActions.editingId}
          editTitle={noteActions.editTitle}
          onEditTitleChange={noteActions.setEditTitle}
          onRenameSubmit={handleRenameSubmit}
          onEditStart={handleEditStartFromHeader}
          onEditCancel={noteActions.handleEditCancel}
          onEditReport={handleEditReport}
          onCopyReport={noteActions.handleCopyReport}
          onDownloadReport={noteActions.handleDownloadReport}
          onExportFlashcards={noteActions.handleExportFlashcards}
          onCopyUserNote={noteActions.handleCopyUserNote}
          onDownloadUserNote={noteActions.handleDownloadUserNote}
          onDownloadInfographic={() => infographicControlsRef.current?.download()}
          onToggleInfographicFullscreen={() => infographicControlsRef.current?.toggleFullscreen()}
          canDownloadInfographic={canDownloadInfographic}
          isInfographicFullscreen={isInfographicFullscreen}
          canCopyOrDownload={noteActions.canCopyOrDownloadReport}
          canCopyOrDownloadUserNote={noteActions.canCopyOrDownloadUserNote}
          isExporting={noteActions.isExporting}
        />

        {/* Main Content */}
        <div
          className={`flex-1 w-full relative ${showDockedMiniPlayer ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {activeNoteId ? (
            isLoadingFullNote || !activeNote ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                <span className="sr-only">Loading note…</span>
              </div>
            ) : (
              <ActiveNoteView
                activeNote={activeNote}
                onBack={handleBack}
                isEditingReportContent={isEditingReportContent}
                onSaveReportContent={handleSaveReportContent}
                onCancelEditReport={handleCancelEditReport}
                registerInfographicControls={handleInfographicControlsRegister}
                onInfographicFullscreenChange={setIsInfographicFullscreen}
                onAskInChat={onAskInChat}
              />
            )
          ) : (
            <NoteListView
              tools={tools}
              notes={notes}
              onToolClick={handleToolClick}
              onNoteClick={handleNoteClick}
              onDeleteNote={noteActions.handleDeleteNote}
              onPlayAudio={handlePlayAudioFromNote}
              editingId={noteActions.editingId}
              editTitle={noteActions.editTitle}
              onEditTitleChange={noteActions.setEditTitle}
              onEditStart={noteActions.handleStartEdit}
              onEditSave={noteActions.handleSaveEdit}
              onEditKeyDown={noteActions.handleKeyDown}
            />
          )}
        </div>

        {/* Mini Audio Player */}
        {showDockedMiniPlayer && (
          <MiniAudioPlayer
            audioUrl={miniPlayerData.audioUrl}
            audioOverviewId={miniPlayerData.audioOverviewId}
            title={miniPlayerData.title}
            transcript={miniPlayerData.transcript}
            isVisible={miniPlayerVisible}
            onClose={onCloseMiniPlayer || (() => undefined)}
            onExpand={onExpandAudioPlayer || (() => undefined)}
          />
        )}
      </div>

      {/* Modals */}
      <CustomizeReportModal
        isOpen={openTool === "reports"}
        onClose={closeTool}
        onSelectFormat={create.reports}
      />
      <CustomizeFlashcardsModal
        isOpen={openTool === "flashcards"}
        onClose={closeTool}
        onGenerate={create.flashcards}
      />
      <CustomizeQuizModal
        isOpen={openTool === "quiz"}
        onClose={closeTool}
        onGenerate={create.quiz}
      />
      <CustomizeAudioModal
        isOpen={openTool === "audio"}
        onClose={closeTool}
        onGenerate={create.audio}
      />
      <CustomizeWrittenQuestionsModal
        isOpen={openTool === "writtenQuestions"}
        onClose={closeTool}
        onGenerate={create.writtenQuestions}
      />
      <CustomizeInfographicModal
        isOpen={openTool === "infographic"}
        onClose={closeTool}
        onGenerate={create.infographic}
      />
      <CustomizeSpreadsheetsModal
        isOpen={openTool === "spreadsheets"}
        onClose={closeTool}
        onGenerate={create.spreadsheets}
      />
      <CustomizeMindMapModal
        isOpen={openTool === "mindmap"}
        onClose={closeTool}
        onGenerate={create.mindmap}
      />

      <ConfirmDialogComponent />
    </>
  );
};
