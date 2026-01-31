import React from 'react';
import { ChevronLeft, FileStack, Copy, Download } from 'lucide-react';
import { Source } from '@/shared/types';

interface SourcesPanelHeaderProps {
  viewingSource: Source | null;
  onBack: () => void;
  onClose: () => void;
  selectedCount: number;
  onCopy: () => void;
  onDownload: () => void;
  canCopyOrDownload: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: (id: string, newTitle: string) => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export const SourcesPanelHeader: React.FC<SourcesPanelHeaderProps> = ({
  viewingSource,
  onBack,
  onClose,
  selectedCount,
  onCopy,
  onDownload,
  canCopyOrDownload,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onResizeStart,
}) => {
  return (
    <>
      {/* Resize Handle (desktop only) */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 z-50 transition-colors active:bg-primary/70 hidden md:block"
        onMouseDown={onResizeStart}
      />

      {/* Mobile Header */}
      <div className="flex md:hidden items-center justify-between gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20 h-14 shrink-0">
        {viewingSource ? (
          <>
            <div className="flex items-center gap-2 text-foreground overflow-hidden min-w-0 flex-1">
              <button
                onClick={onBack}
                className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
                aria-label="Back to sources"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  spellCheck={false}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      onRenameSubmit(viewingSource.id, renameValue.trim());
                    } else if (e.key === 'Escape') {
                      onRenameChange(viewingSource.title);
                      onBack();
                    }
                  }}
                  onBlur={() => {
                    if (renameValue.trim()) {
                      onRenameSubmit(viewingSource.id, renameValue.trim());
                    } else {
                      onRenameChange(viewingSource.title);
                    }
                    onBack();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 font-sans font-bold text-sm tracking-wide bg-transparent border-0 border-b border-border rounded-none px-0 py-0.5 text-foreground focus:outline-none focus:ring-0 focus:border-primary"
                  autoFocus
                  aria-label="Rename source"
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onRenameChange(viewingSource.title);
                    onBack();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRenameChange(viewingSource.title);
                      onBack();
                    }
                  }}
                  className="font-sans font-bold text-sm tracking-wide truncate text-foreground cursor-text hover:opacity-80"
                  title="Click to rename"
                >
                  {viewingSource.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onCopy}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy content as Markdown"
                aria-label="Copy content as Markdown"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download as Markdown file"
                aria-label="Download as Markdown file"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-foreground">
              <FileStack className="w-4 h-4" />
              <span className="font-sans font-bold text-sm tracking-wide uppercase">Sources</span>
              <span className="ml-2 text-xs text-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded-full font-mono">
                {selectedCount}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground/70 hover:text-foreground flex items-center justify-center shrink-0"
              aria-label="Close sources panel"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Desktop Header */}
      <div className="hidden md:flex items-center justify-between p-4 border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10 h-14">
        {viewingSource ? (
          <>
            <div className="flex items-center gap-2 text-sidebar-foreground overflow-hidden min-w-0 flex-1">
              <button
                onClick={onBack}
                className="p-1 -ml-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  spellCheck={false}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      onRenameSubmit(viewingSource.id, renameValue.trim());
                    } else if (e.key === 'Escape') {
                      onRenameChange(viewingSource.title);
                      onBack();
                    }
                  }}
                  onBlur={() => {
                    if (renameValue.trim()) {
                      onRenameSubmit(viewingSource.id, renameValue.trim());
                    } else {
                      onRenameChange(viewingSource.title);
                    }
                    onBack();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 font-sans font-bold text-sm tracking-wide bg-transparent border-0 border-b border-border rounded-none px-0 py-0.5 text-sidebar-foreground focus:outline-none focus:ring-0 focus:border-primary"
                  autoFocus
                  aria-label="Rename source"
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onRenameChange(viewingSource.title);
                    onBack();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRenameChange(viewingSource.title);
                      onBack();
                    }
                  }}
                  className="font-sans font-bold text-sm tracking-wide truncate text-left min-w-0 flex-1 cursor-text hover:opacity-80 hover:underline hover:decoration-dotted hover:underline-offset-2 transition-opacity outline-none focus:outline-none focus:opacity-80 bg-transparent"
                  title="Click to rename"
                >
                  {viewingSource.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onCopy}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy content as Markdown"
                aria-label="Copy content as Markdown"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={!canCopyOrDownload}
                className="p-2 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download as Markdown file"
                aria-label="Download as Markdown file"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sidebar-foreground">
              <FileStack className="w-4 h-4" />
              <span className="font-sans font-bold text-sm tracking-wide uppercase">Sources</span>
              <span className="ml-2 text-xs text-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded-full font-mono">
                {selectedCount}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </>
  );
};
