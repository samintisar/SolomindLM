import React, { useState, useEffect } from 'react';
import { X, XCircle, Save } from 'lucide-react';
import { Note, isReportNote, isFlashcardNote, isQuizNote, isMindMapNote, isAudioNote, isWrittenQuestionsNote, isSlideDeckNote, isSpreadsheetNote, isUserNote } from '@/shared/types/index';
import { ReportView } from './views/ReportView';
import { FlashcardView } from './views/FlashcardView';
import { QuizView } from './views/QuizView';
import { MindMapView } from './views/MindMapView';
import { WrittenQuestionsView } from './views/WrittenQuestionsView';
import { SlidesView } from './views/SlidesView';
import { SpreadsheetView } from './views/SpreadsheetView';
import { UserNoteView } from './views/UserNoteView';
import { AudioPlayer } from '@/features/audio/components/AudioPlayer';
import type { ReportNote } from '@/shared/types/index';

interface ReportMarkdownEditorProps {
  note: ReportNote;
  onSave: (reportId: string, content: string) => void | Promise<void>;
  onCancel: () => void;
}

const ReportMarkdownEditor: React.FC<ReportMarkdownEditorProps> = ({ note, onSave, onCancel }) => {
  const [draftContent, setDraftContent] = useState(note.content ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftContent(note.content ?? '');
  }, [note.id, note.content]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(note.id, draftContent);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-end gap-2 p-3 border-b border-border bg-card/50 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-transparent hover:border-border rounded-md bg-transparent hover:bg-secondary/50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          className="w-full h-full min-h-[200px] p-4 rounded-lg border border-border bg-card text-foreground font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          placeholder="Write your report in Markdown..."
          spellCheck={false}
        />
      </div>
    </div>
  );
};

interface ActiveNoteViewProps {
  activeNote: Note;
  isMindMapExpanded: boolean;
  onToggleMindMap: () => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  isMobile: boolean;
  onBack: () => void;
  isEditingReportContent?: boolean;
  onSaveReportContent?: (reportId: string, content: string) => void | Promise<void>;
  onCancelEditReport?: () => void;
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
  isEditingReportContent,
  onSaveReportContent,
  onCancelEditReport,
}) => {
  // Report view or report markdown editor
  if (isReportNote(activeNote)) {
    if (isEditingReportContent && onSaveReportContent && onCancelEditReport) {
      return (
        <ReportMarkdownEditor
          note={activeNote}
          onSave={onSaveReportContent}
          onCancel={onCancelEditReport}
        />
      );
    }
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

  // User note view (saved chats and manual notes)
  if (isUserNote(activeNote)) {
    return <UserNoteView
      note={activeNote}
      onBack={isMobile ? onBack : undefined}
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
