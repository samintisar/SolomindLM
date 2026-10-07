import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  PenTool,
} from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  isFlashcardNote,
  isInfographicNote,
  isReportNote,
  isUserNote,
  Note,
} from "@/shared/types/index";

interface StudioPanelHeaderProps {
  activeNote: Note | null;
  onBack: () => void;
  onClose: () => void;
  editingId: string | null;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onRenameSubmit: (id: string, newTitle: string) => void;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditReport?: () => void;
  onCopyReport: () => void;
  onDownloadReport: () => void;
  onExportFlashcards: () => void;
  onCopyUserNote: () => void;
  onDownloadUserNote: () => void;
  onDownloadInfographic: () => void;
  onToggleInfographicFullscreen: () => void;
  canDownloadInfographic: boolean;
  isInfographicFullscreen: boolean;
  canCopyOrDownload: boolean;
  canCopyOrDownloadUserNote: boolean;
  isExporting: boolean;
}

type HeaderTitleProps = Pick<
  StudioPanelHeaderProps,
  | "onBack"
  | "editingId"
  | "editTitle"
  | "onEditTitleChange"
  | "onRenameSubmit"
  | "onEditStart"
  | "onEditCancel"
> & { note: Note };

/** Back button plus the note title; the title renames inline (click-to-rename from md up). */
function HeaderTitle({
  note,
  onBack,
  editingId,
  editTitle,
  onEditTitleChange,
  onRenameSubmit,
  onEditStart,
  onEditCancel,
}: HeaderTitleProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingId === note.id;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-foreground md:text-sidebar-foreground">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onBack}
        aria-label="Back to Studio"
        className="md:-ml-1"
      >
        <ArrowLeft className="size-5" />
      </Button>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          spellCheck={false}
          onChange={(e) => onEditTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editTitle.trim()) {
              onRenameSubmit(note.id, editTitle.trim());
            } else if (e.key === "Escape") {
              onEditTitleChange(note.title);
              onEditCancel();
            }
          }}
          onBlur={() => {
            if (editTitle.trim()) {
              onRenameSubmit(note.id, editTitle.trim());
            } else {
              onEditTitleChange(note.title);
            }
            onEditCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded-none border-0 border-b border-border bg-transparent px-0 py-0.5 font-display text-sm font-bold tracking-wide text-foreground focus:border-primary focus:ring-0 focus:outline-none md:text-sidebar-foreground"
          aria-label="Rename"
          autoFocus
        />
      ) : (
        <>
          <span className="truncate font-display text-sm font-bold tracking-wide text-foreground md:hidden">
            {note.title}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditStart();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEditStart();
              }
            }}
            className="hidden min-w-0 flex-1 cursor-text truncate bg-transparent text-left font-display text-sm font-bold tracking-wide outline-none transition-opacity hover:underline hover:decoration-dotted hover:underline-offset-2 hover:opacity-80 focus:opacity-80 focus:outline-none md:block"
            title="Click to rename"
          >
            {note.title}
          </span>
        </>
      )}
    </div>
  );
}

type NoteHeaderActionsProps = Omit<
  StudioPanelHeaderProps,
  | "activeNote"
  | "onBack"
  | "onClose"
  | "editingId"
  | "editTitle"
  | "onEditTitleChange"
  | "onRenameSubmit"
  | "onEditStart"
  | "onEditCancel"
> & { note: Note };

/** The open note's icon actions (copy, download, edit, fullscreen), by note type. */
function NoteHeaderActions({
  note,
  onEditReport,
  onCopyReport,
  onDownloadReport,
  onExportFlashcards,
  onCopyUserNote,
  onDownloadUserNote,
  onDownloadInfographic,
  onToggleInfographicFullscreen,
  canDownloadInfographic,
  isInfographicFullscreen,
  canCopyOrDownload,
  canCopyOrDownloadUserNote,
  isExporting,
}: NoteHeaderActionsProps) {
  if (isReportNote(note)) {
    return (
      <ButtonGroup variant="tray" className="shrink-0">
        {onEditReport && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEditReport}
            title="Edit report"
            aria-label="Edit report"
          >
            <Pencil />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCopyReport}
          disabled={!canCopyOrDownload}
          title="Copy report as Markdown"
          aria-label="Copy report as Markdown"
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDownloadReport}
          disabled={!canCopyOrDownload}
          title="Download report as Markdown file"
          aria-label="Download report as Markdown file"
        >
          <Download />
        </Button>
      </ButtonGroup>
    );
  }

  if (isUserNote(note)) {
    return (
      <ButtonGroup variant="tray" className="shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCopyUserNote}
          disabled={!canCopyOrDownloadUserNote}
          title="Copy note"
          aria-label="Copy note"
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDownloadUserNote}
          disabled={!canCopyOrDownloadUserNote}
          title="Download as Markdown"
          aria-label="Download as Markdown"
        >
          <Download />
        </Button>
      </ButtonGroup>
    );
  }

  if (isFlashcardNote(note)) {
    return (
      <ButtonGroup variant="tray" className="shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onExportFlashcards}
          disabled={isExporting}
          title="Download flashcards as CSV"
          aria-label="Download flashcards as CSV"
        >
          {isExporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download />}
        </Button>
      </ButtonGroup>
    );
  }

  if (isInfographicNote(note)) {
    return (
      <ButtonGroup variant="tray" className="shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDownloadInfographic}
          disabled={!canDownloadInfographic}
          title="Download infographic"
          aria-label="Download infographic"
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleInfographicFullscreen}
          title={isInfographicFullscreen ? "Exit fullscreen" : "Full screen"}
          aria-label={isInfographicFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isInfographicFullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </ButtonGroup>
    );
  }

  return null;
}

/**
 * StudioPanelHeader renders the header for the Studio panel: the "Studio" label in list view,
 * or the open note's title and actions. One layout; breakpoint classes adapt it for mobile.
 */
export const StudioPanelHeader: React.FC<StudioPanelHeaderProps> = ({
  activeNote,
  onBack,
  onClose,
  editingId,
  editTitle,
  onEditTitleChange,
  onRenameSubmit,
  onEditStart,
  onEditCancel,
  ...actions
}) => (
  <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/80 p-4 backdrop-blur-sm md:z-10 md:bg-sidebar/50">
    {activeNote ? (
      <>
        <HeaderTitle
          note={activeNote}
          onBack={onBack}
          editingId={editingId}
          editTitle={editTitle}
          onEditTitleChange={onEditTitleChange}
          onRenameSubmit={onRenameSubmit}
          onEditStart={onEditStart}
          onEditCancel={onEditCancel}
        />
        <NoteHeaderActions note={activeNote} {...actions} />
      </>
    ) : (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close Studio panel"
          className="hidden md:inline-flex"
        >
          <ChevronRight className="size-5" />
        </Button>
        <div className="flex items-center gap-2 text-foreground md:text-sidebar-foreground">
          <PenTool className="size-4 shrink-0" />
          <span className="font-display text-sm font-bold tracking-wide uppercase">Studio</span>
        </div>
      </>
    )}
  </div>
);
