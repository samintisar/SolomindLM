import { Loader2, Save, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { AudioPlayer } from "@/features/audio/components/AudioPlayer";
import { Button } from "@/shared/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import type { ReportNote } from "@/shared/types/index";
import {
  isAudioOverviewNote,
  isFlashcardNote,
  isInfographicNote,
  isMindMapNote,
  isQuizNote,
  isReportNote,
  isSpreadsheetNote,
  isUserNote,
  isWrittenQuestionsNote,
  Note,
} from "@/shared/types/index";
import { studioErrorMessage } from "../utils/studioErrorMessage";
import { FlashcardView } from "./views/FlashcardView";
import type { InfographicViewControls } from "./views/InfographicView";
import { InfographicView } from "./views/InfographicView";
import { MindMapView } from "./views/MindMapView";
import { QuizView } from "./views/QuizView";
import { ReportView } from "./views/ReportView";
import { SpreadsheetView } from "./views/SpreadsheetView";
import { UserNoteView } from "./views/UserNoteView";
import { WrittenQuestionsView } from "./views/WrittenQuestionsView";

interface ReportMarkdownEditorProps {
  note: ReportNote;
  onSave: (reportId: string, content: string) => void | Promise<void>;
  onCancel: () => void;
}

const ReportMarkdownEditor: React.FC<ReportMarkdownEditorProps> = ({ note, onSave, onCancel }) => {
  const [draftContent, setDraftContent] = useState(note.content ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftContent(note.content ?? "");
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
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
          <Save />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          className="w-full h-full min-h-50 p-4 rounded-lg border border-border bg-card text-foreground font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          placeholder="Write your report in Markdown..."
          spellCheck={false}
        />
      </div>
    </div>
  );
};

interface ActiveNoteViewProps {
  activeNote: Note;
  /** Back to the note list; only the user-note view shows its own (mobile) back bar. */
  onBack: () => void;
  isEditingReportContent?: boolean;
  onSaveReportContent?: (reportId: string, content: string) => void | Promise<void>;
  onCancelEditReport?: () => void;
  registerInfographicControls?: (controls: InfographicViewControls | null) => void;
  onInfographicFullscreenChange?: (isFullscreen: boolean) => void;
  onAskInChat?: (prompt: string, documentIds?: string[]) => void;
}

/** A centred status screen (no audio file, failed, generating, unsupported). */
function StatusScreen({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * ActiveNoteView component displays the currently active note.
 * Conditionally renders the appropriate view component based on note type.
 */
export const ActiveNoteView: React.FC<ActiveNoteViewProps> = ({
  activeNote,
  onBack,
  isEditingReportContent,
  onSaveReportContent,
  onCancelEditReport,
  registerInfographicControls,
  onInfographicFullscreenChange,
  onAskInChat,
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
    return <ReportView note={activeNote} />;
  }

  if (isFlashcardNote(activeNote)) {
    return <FlashcardView note={activeNote} />;
  }

  if (isQuizNote(activeNote)) {
    return <QuizView note={activeNote} />;
  }

  if (isMindMapNote(activeNote)) {
    return <MindMapView note={activeNote} onAskInChat={onAskInChat} />;
  }

  // Studio audio overview (Convex audioOverviews — top-level audioUrl / transcript)
  if (isAudioOverviewNote(activeNote)) {
    const url = activeNote.audioUrl?.trim() ?? "";
    if (activeNote.status === "completed") {
      if (!url) {
        return (
          <StatusScreen
            icon={<X />}
            title="Audio unavailable"
            description="This overview finished without an audio file. Try generating it again."
          />
        );
      }
      return (
        <AudioPlayer
          audioUrl={url}
          audioOverviewId={activeNote.id}
          transcript={activeNote.transcript}
          metadata={activeNote.metadata}
          title={activeNote.title}
          onBack={undefined}
        />
      );
    }
    if (activeNote.status === "failed") {
      return (
        <StatusScreen
          icon={<X className="text-destructive" />}
          title="Generation Failed"
          description={studioErrorMessage(
            activeNote.metadata?.error,
            "An error occurred while generating the audio overview"
          )}
        />
      );
    }
    return (
      <StatusScreen
        icon={<Loader2 className="animate-spin text-primary" />}
        title="Generating audio overview"
        description="This can take a few minutes. You can keep this notebook open; the player will appear when it is ready."
      />
    );
  }

  if (isWrittenQuestionsNote(activeNote)) {
    return <WrittenQuestionsView note={activeNote} />;
  }

  if (isInfographicNote(activeNote)) {
    return (
      <InfographicView
        note={activeNote}
        registerControls={registerInfographicControls}
        onFullscreenChange={onInfographicFullscreenChange}
      />
    );
  }

  if (isSpreadsheetNote(activeNote)) {
    return <SpreadsheetView note={activeNote} />;
  }

  // User note view (saved chats and manual notes)
  if (isUserNote(activeNote)) {
    return <UserNoteView note={activeNote} onBack={onBack} />;
  }

  return (
    <StatusScreen
      icon={<X />}
      title="Unknown Note Type"
      description="This note type is not supported yet."
    />
  );
};
