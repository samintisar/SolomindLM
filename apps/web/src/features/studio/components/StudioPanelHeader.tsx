import React, { useRef, useEffect } from 'react';
import { ChevronRight, PenTool, ArrowLeft, Copy, Download, Loader2, Pencil } from 'lucide-react';
import { Note, isReportNote, isFlashcardNote, isSpreadsheetNote, isUserNote } from '@/shared/types/index';

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
  onDownloadSpreadsheet: () => void;
  onExportFlashcards: () => void;
  onCopyUserNote: () => void;
  onDownloadUserNote: () => void;
  canCopyOrDownload: boolean;
  canCopyOrDownloadUserNote: boolean;
  canExportFlashcards: boolean;
  canDownloadSpreadsheet: boolean;
  isExporting: boolean;
  isMobile: boolean;
}

/**
 * StudioPanelHeader component renders the header for the Studio panel.
 * Shows different layouts for mobile vs desktop, and for list view vs active note view.
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
  onEditReport,
  onCopyReport,
  onDownloadReport,
  onDownloadSpreadsheet,
  onExportFlashcards,
  onCopyUserNote,
  onDownloadUserNote,
  canCopyOrDownload,
  canCopyOrDownloadUserNote,
  canExportFlashcards,
  canDownloadSpreadsheet,
  isExporting,
  isMobile,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId === activeNote?.id && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId, activeNote]);

  // Mobile header
  if (isMobile) {
    return (
      <div className="flex md:hidden items-center justify-between gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20 h-14 shrink-0">
        {activeNote ? (
          <>
            <div className="flex items-center gap-2 text-foreground overflow-hidden min-w-0 flex-1">
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
                aria-label="Back to Studio"
              >
                <ArrowLeft className="w-5 h-5 shrink-0" />
              </button>
              {editingId === activeNote.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  spellCheck={false}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editTitle.trim()) {
                      onRenameSubmit(activeNote.id, editTitle.trim());
                    } else if (e.key === 'Escape') {
                      onEditTitleChange(activeNote.title);
                      onEditCancel();
                    }
                  }}
                  onBlur={() => {
                    if (editTitle.trim()) {
                      onRenameSubmit(activeNote.id, editTitle.trim());
                    } else {
                      onEditTitleChange(activeNote.title);
                    }
                    onEditCancel();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 font-sans font-bold text-sm tracking-wide bg-transparent border-0 border-b border-border rounded-none px-0 py-0.5 text-foreground focus:outline-none focus:ring-0 focus:border-primary"
                  aria-label="Rename"
                  autoFocus
                />
              ) : (
                <span className="font-sans font-bold text-sm tracking-wide truncate text-foreground">
                  {activeNote.title}
                </span>
              )}
            </div>
            {isReportNote(activeNote) && (
              <div className="flex items-center gap-1 shrink-0">
                {onEditReport && (
                  <button
                    type="button"
                    onClick={onEditReport}
                    className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground"
                    title="Edit report"
                    aria-label="Edit report"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCopyReport}
                  disabled={!canCopyOrDownload}
                  className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Copy report as Markdown"
                  aria-label="Copy report as Markdown"
                >
                  <Copy className="w-4 h-4" />
                </button>
              <button
                type="button"
                onClick={onDownloadReport}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download report as Markdown file"
                aria-label="Download report as Markdown file"
              >
                <Download className="w-4 h-4" />
              </button>
              </div>
            )}
            {isUserNote(activeNote) && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onCopyUserNote}
                  disabled={!canCopyOrDownloadUserNote}
                  className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Copy note"
                  aria-label="Copy note"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onDownloadUserNote}
                  disabled={!canCopyOrDownloadUserNote}
                  className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Download as Markdown"
                  aria-label="Download as Markdown"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            )}
            {isFlashcardNote(activeNote) && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onExportFlashcards}
                  disabled={isExporting}
                  className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Download flashcards as CSV"
                  aria-label="Download flashcards as CSV"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
            {isSpreadsheetNote(activeNote) && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onDownloadSpreadsheet}
                  disabled={!canDownloadSpreadsheet}
                  className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Download as CSV"
                  aria-label="Download as CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-foreground">
            <PenTool className="w-4 h-4 shrink-0" />
            <span className="font-sans font-bold text-sm tracking-wide uppercase">Studio</span>
          </div>
        )}
      </div>
    );
  }

  // Desktop header
  return (
    <div className="hidden md:flex items-center justify-between p-4 border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10 h-14">
      {activeNote ? (
        <>
          <div className="flex items-center gap-2 text-sidebar-foreground overflow-hidden min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="p-1 -ml-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center justify-center shrink-0"
              aria-label="Back to Studio"
            >
              <ArrowLeft className="w-5 h-5 shrink-0" />
            </button>
            {editingId === activeNote.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editTitle}
                spellCheck={false}
                onChange={(e) => onEditTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editTitle.trim()) {
                    onRenameSubmit(activeNote.id, editTitle.trim());
                  } else if (e.key === 'Escape') {
                    onEditTitleChange(activeNote.title);
                    onEditCancel();
                  }
                }}
                onBlur={() => {
                  if (editTitle.trim()) {
                    onRenameSubmit(activeNote.id, editTitle.trim());
                  } else {
                    onEditTitleChange(activeNote.title);
                  }
                  onEditCancel();
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 font-sans font-bold text-sm tracking-wide bg-transparent border-0 border-b border-border rounded-none px-0 py-0.5 text-sidebar-foreground focus:outline-none focus:ring-0 focus:border-primary"
                aria-label="Rename"
                autoFocus
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEditStart();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onEditStart();
                  }
                }}
                className="font-sans font-bold text-sm tracking-wide truncate text-left min-w-0 flex-1 cursor-text hover:opacity-80 hover:underline hover:decoration-dotted hover:underline-offset-2 transition-opacity outline-none focus:outline-none focus:opacity-80 bg-transparent"
                title="Click to rename"
              >
                {activeNote.title}
              </span>
            )}
          </div>
          {isReportNote(activeNote) && (
            <div className="flex items-center gap-1 shrink-0">
              {onEditReport && (
                <button
                  type="button"
                  onClick={onEditReport}
                  className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  title="Edit report"
                  aria-label="Edit report"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onCopyReport}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy report as Markdown"
                aria-label="Copy report as Markdown"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDownloadReport}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download report as Markdown file"
                aria-label="Download report as Markdown file"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          )}
          {isUserNote(activeNote) && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onCopyUserNote}
                disabled={!canCopyOrDownloadUserNote}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy note"
                aria-label="Copy note"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDownloadUserNote}
                disabled={!canCopyOrDownloadUserNote}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download as Markdown"
                aria-label="Download as Markdown"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          )}
          {isFlashcardNote(activeNote) && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onExportFlashcards}
                disabled={isExporting}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download flashcards as CSV"
                aria-label="Download flashcards as CSV"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
          {isSpreadsheetNote(activeNote) && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onDownloadSpreadsheet}
                disabled={!canDownloadSpreadsheet}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download as CSV"
                aria-label="Download as CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            onClick={onClose}
            className="hidden md:flex p-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground items-center justify-center shrink-0"
            aria-label="Close Studio panel"
          >
            <ChevronRight className="w-5 h-5 shrink-0" />
          </button>
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <PenTool className="w-4 h-4 shrink-0" />
            <span className="font-sans font-bold text-sm tracking-wide uppercase">Studio</span>
          </div>
        </>
      )}
    </div>
  );
};
