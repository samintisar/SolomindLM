import React from 'react';
import { X } from 'lucide-react';
import { Note, isReportNote, isFlashcardNote, isQuizNote, isMindMapNote, isAudioNote, isWrittenQuestionsNote, isSlideDeckNote, isSpreadsheetNote } from '@/shared/types/index';
import { ReportView } from './views/ReportView';
import { FlashcardView } from './views/FlashcardView';
import { QuizView } from './views/QuizView';
import { MindMapView } from './views/MindMapView';
import { WrittenQuestionsView } from './views/WrittenQuestionsView';
import { SlidesView } from './views/SlidesView';
import { SpreadsheetView } from './views/SpreadsheetView';
import { AudioPlayer } from '@/features/audio/components/AudioPlayer';

interface ActiveNoteViewProps {
  activeNote: Note;
  isMindMapExpanded: boolean;
  onToggleMindMap: () => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  isMobile: boolean;
  onBack: () => void;
}

/**
 * ActiveNoteView component displays the currently active note.
 * Conditionally renders the appropriate view component based on note type.
 */
export const ActiveNoteView: React.FC<ActiveNoteViewProps> = ({
  activeNote,
  isMindMapExpanded,
  onToggleMindMap,
  onUpdateNoteFull,
  isMobile,
  onBack,
}) => {
  // Report view
  if (isReportNote(activeNote)) {
    return <ReportView note={activeNote} onBack={undefined} />;
  }

  // Flashcard view
  if (isFlashcardNote(activeNote)) {
    return <FlashcardView note={activeNote} onBack={undefined} />;
  }

  // Quiz view (no onBack on mobile - StudioPanelHeader provides single header)
  if (isQuizNote(activeNote)) {
    return <QuizView
      note={activeNote}
      onNoteUpdate={(updatedNote) => onUpdateNoteFull?.(activeNote.id, updatedNote)}
      onBack={undefined}
    />;
  }

  // MindMap view
  if (isMindMapNote(activeNote)) {
    return <MindMapView
      note={activeNote}
      isExpanded={isMindMapExpanded}
      onToggleExpanded={onToggleMindMap}
      onBack={isMobile ? onBack : undefined}
    />;
  }

  // Audio view
  if (isAudioNote(activeNote)) {
    // Completed state with audio player
    if (activeNote.status === 'completed' && activeNote.metadata.audioUrl) {
      return <AudioPlayer
        audioUrl={activeNote.metadata.audioUrl}
        transcript={activeNote.content}
        title={activeNote.title}
        onBack={isMobile ? onBack : undefined}
      />;
    }

    // Failed state
    if (activeNote.status === 'failed') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <X className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-destructive">Generation Failed</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {activeNote.metadata.error || 'An error occurred while generating the audio overview'}
            </p>
          </div>
        </div>
      );
    }
  }

  // Written questions view (no onBack on mobile - StudioPanelHeader provides single header)
  if (isWrittenQuestionsNote(activeNote)) {
    return <WrittenQuestionsView
      note={activeNote}
      onNoteUpdate={(updatedNote) => onUpdateNoteFull?.(activeNote.id, updatedNote)}
      onBack={undefined}
    />;
  }

  // Slides view
  if (isSlideDeckNote(activeNote)) {
    return <SlidesView
      note={activeNote}
      onNoteUpdate={(updatedNote) => onUpdateNoteFull?.(activeNote.id, updatedNote)}
      onBack={isMobile ? onBack : undefined}
    />;
  }

  // Spreadsheet view (no onBack on mobile - StudioPanelHeader provides single header)
  if (isSpreadsheetNote(activeNote)) {
    return <SpreadsheetView
      note={activeNote}
      onBack={undefined}
    />;
  }

  // Fallback for unknown note types
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <X className="w-6 h-6 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Unknown Note Type</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This note type is not supported yet.
        </p>
      </div>
    </div>
  );
};
