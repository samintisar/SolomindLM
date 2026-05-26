import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StudioTool,
  Note,
  isAudioNote,
  isAudioOverviewNote,
  isInfographicNote,
} from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { CustomizeReportModal } from "./CustomizeReportModal";
import { CustomizeFlashcardsModal } from "./CustomizeFlashcardsModal";
import { CustomizeQuizModal } from "./CustomizeQuizModal";
import { CustomizeAudioModal } from "./CustomizeAudioModal";
import { CustomizeWrittenQuestionsModal } from "./CustomizeWrittenQuestionsModal";
import { CustomizeInfographicModal } from "./CustomizeInfographicModal";
import { CustomizeSpreadsheetsModal } from "./CustomizeSpreadsheetsModal";
import { ResizeHandle } from "./ResizeHandle";
import { StudioPanelHeader } from "./StudioPanelHeader";
import { NoteListView } from "./NoteListView";
import { ActiveNoteView } from "./ActiveNoteView";
import { MiniAudioPlayer } from "@/features/audio/components/MiniAudioPlayer";
import { useStudioContext } from "../useStudioContext";
import { useAudioPlayerContext } from "@/features/audio/useAudioPlayer";
import { useStudioHandlers } from "../hooks/useStudioHandlers";
import { useNoteActions } from "../hooks/useNoteActions";
import type { InfographicViewControls } from "./views/InfographicView";

function isShowingExpandedAudioPlayer(note: Note): boolean {
  if (isAudioOverviewNote(note) && note.status === "completed") {
    return Boolean(note.audioUrl?.trim());
  }
  if (isAudioNote(note) && note.status === "completed") {
    return Boolean(note.metadata.audioUrl);
  }
  return false;
}

interface StudioPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tools: StudioTool[];
  width: number;
  isResizing: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sources?: any[];
  userId?: string | null;
  noteId?: string | null;
}

/**
 * StudioPanel component - Main studio creation and notes panel.
 * Refactored to use sub-components for better maintainability.
 */
export const StudioPanel: React.FC<StudioPanelProps> = ({
  isOpen,
  onClose,
  tools,
  width,
  isResizing: _isResizing,
  sources = [],
  userId,
  noteId,
}) => {
  const { notes, onUpdateNote, onUpdateNoteFull, onDeleteNote, onAddNote, onSaveReportContent } =
    useStudioContext();

  const { miniPlayerVisible, miniPlayerData, onPlayAudio, onCloseMiniPlayer, onExpandAudioPlayer } =
    useAudioPlayerContext();

  // State
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isMindMapExpanded, setIsMindMapExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isEditingReportContent, setIsEditingReportContent] = useState(false);
  const [isInfographicFullscreen, setIsInfographicFullscreen] = useState(false);
  const infographicControlsRef = useRef<InfographicViewControls | null>(null);

  // Derived state
  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsInfographicFullscreen(false);
    }
  }, [activeNote]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Custom event handler for setting active note from external sources
  useEffect(() => {
    const handleSetActiveNote = (event: Event) => {
      const customEvent = event as CustomEvent;
      const noteId = customEvent.detail?.noteId;
      if (noteId) {
        const note = notes.find((n) => n.id === noteId);
        // Prevent setting generating notes as active
        if (note && note.status !== "generating") {
          setActiveNoteId(noteId);
        }
      }
    };
    window.addEventListener("setActiveNote", handleSetActiveNote);
    return () => window.removeEventListener("setActiveNote", handleSetActiveNote);
  }, [notes]);

  // Confirm dialog
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Note actions hook (edit, copy, download, delete, export)
  const noteActions = useNoteActions({
    activeNote,
    notes,
    onUpdateNote,
    onDeleteNote,
    confirm,
  });

  // Studio handlers hook (modals, creation flows)
  const {
    isReportModalOpen,
    isFlashcardModalOpen,
    isQuizModalOpen,
    isAudioModalOpen,
    isWrittenQuestionsModalOpen,
    isInfographicModalOpen,
    isSpreadsheetsModalOpen,
    setIsReportModalOpen,
    setIsFlashcardModalOpen,
    setIsQuizModalOpen,
    setIsAudioModalOpen,
    setIsWrittenQuestionsModalOpen,
    setIsInfographicModalOpen,
    setIsSpreadsheetsModalOpen,
    handleToolClick,
    handleCreateReport,
    handleCreateFlashcards,
    handleCreateQuiz,
    handleCreateAudio,
    handleCreateWrittenQuestions,
    handleCreateInfographic,
    handleCreateSpreadsheet,
  } = useStudioHandlers({
    notes,
    sources,
    userId,
    noteId,
    onAddNote,
    onUpdateNote,
    onUpdateNoteFull,
    onDeleteNote,
    onSetActiveNoteId: setActiveNoteId,
    confirm,
  });

  // Handle note click (for viewing)
  const handleNoteClick = (note: Note) => {
    // Prevent clicking on generating notes
    if (note.status === "generating") {
      return;
    }
    if (
      note.type === "quiz" ||
      note.type === "flashcard" ||
      note.type === "report" ||
      note.type === "mindmap" ||
      note.type === "audio" ||
      note.type === "audioOverview" ||
      note.type === "writtenQuestions" ||
      note.type === "infographic" ||
      note.type === "spreadsheet" ||
      note.type === "note"
    ) {
      setActiveNoteId(note.id);
    }
  };

  // Handle play audio from note item
  const handlePlayAudioFromNote = (note: Note) => {
    if (note.type === "audio" && note.metadata.audioUrl) {
      onPlayAudio?.(note.metadata.audioUrl, note.title, note.content, note.id);
    } else if (isAudioOverviewNote(note) && note.audioUrl) {
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
            onClose={onCloseMiniPlayer || (() => {})}
            onExpand={onExpandAudioPlayer || (() => {})}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div
        style={{
          width: isMobile ? "100%" : width,
        }}
        className={`
          relative shrink-0 bg-sidebar border-l-2 border-border h-full flex flex-col
          overflow-hidden
          opacity-100
          md:w-auto w-full max-w-full
        `}
      >
        {/* Resize Handle */}
        <ResizeHandle width={width} position="left" />

        {/* Header */}
        <StudioPanelHeader
          activeNote={activeNote}
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
          onDownloadSpreadsheet={noteActions.handleDownloadSpreadsheet}
          onExportFlashcards={noteActions.handleExportFlashcards}
          onCopyUserNote={noteActions.handleCopyUserNote}
          onDownloadUserNote={noteActions.handleDownloadUserNote}
          onDownloadInfographic={() => infographicControlsRef.current?.download()}
          onToggleInfographicFullscreen={() => infographicControlsRef.current?.toggleFullscreen()}
          canDownloadInfographic={canDownloadInfographic}
          isInfographicFullscreen={isInfographicFullscreen}
          canCopyOrDownload={noteActions.canCopyOrDownloadReport}
          canCopyOrDownloadUserNote={noteActions.canCopyOrDownloadUserNote}
          canExportFlashcards={noteActions.canExportFlashcards}
          canDownloadSpreadsheet={noteActions.canDownloadSpreadsheet}
          isExporting={noteActions.isExporting}
          isMobile={isMobile}
        />

        {/* Main Content */}
        <div
          className={`flex-1 w-full relative ${showDockedMiniPlayer ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {activeNote ? (
            <ActiveNoteView
              activeNote={activeNote}
              isMindMapExpanded={isMindMapExpanded}
              onToggleMindMap={() => setIsMindMapExpanded(!isMindMapExpanded)}
              onUpdateNoteFull={onUpdateNoteFull}
              isMobile={isMobile}
              onBack={handleBack}
              isEditingReportContent={isEditingReportContent}
              onSaveReportContent={handleSaveReportContent}
              onCancelEditReport={handleCancelEditReport}
              registerInfographicControls={handleInfographicControlsRegister}
              onInfographicFullscreenChange={setIsInfographicFullscreen}
            />
          ) : (
            <NoteListView
              tools={tools}
              notes={notes}
              activeNoteId={activeNoteId}
              width={width}
              onToolClick={handleToolClick}
              onNoteClick={handleNoteClick}
              onDeleteNote={noteActions.handleDeleteNote}
              onPlayAudio={handlePlayAudioFromNote}
              editingId={noteActions.editingId}
              editTitle={noteActions.editTitle}
              onEditTitleChange={noteActions.setEditTitle}
              onEditStart={noteActions.handleStartEdit}
              onEditSave={noteActions.handleSaveEdit}
              onEditCancel={noteActions.handleEditCancel}
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
            onClose={onCloseMiniPlayer || (() => {})}
            onExpand={onExpandAudioPlayer || (() => {})}
          />
        )}
      </div>

      {/* Modals */}
      <CustomizeReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSelectFormat={handleCreateReport}
      />

      <CustomizeFlashcardsModal
        isOpen={isFlashcardModalOpen}
        onClose={() => setIsFlashcardModalOpen(false)}
        onGenerate={handleCreateFlashcards}
      />

      <CustomizeQuizModal
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
        onGenerate={handleCreateQuiz}
      />

      <CustomizeAudioModal
        isOpen={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
        onGenerate={handleCreateAudio}
      />

      <CustomizeWrittenQuestionsModal
        isOpen={isWrittenQuestionsModalOpen}
        onClose={() => setIsWrittenQuestionsModalOpen(false)}
        onGenerate={handleCreateWrittenQuestions}
      />

      <CustomizeInfographicModal
        isOpen={isInfographicModalOpen}
        onClose={() => setIsInfographicModalOpen(false)}
        onGenerate={handleCreateInfographic}
      />

      <CustomizeSpreadsheetsModal
        isOpen={isSpreadsheetsModalOpen}
        onClose={() => setIsSpreadsheetsModalOpen(false)}
        onGenerate={handleCreateSpreadsheet}
      />

      <ConfirmDialogComponent />
    </>
  );
};
