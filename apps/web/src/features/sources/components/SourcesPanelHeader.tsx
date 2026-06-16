import { ChevronLeft, Copy, Download, ExternalLink, FileStack } from "lucide-react";
import React from "react";
import { Source } from "@/shared/types";

interface SourcesPanelHeaderProps {
  viewingSource: Source | null;
  onBackToList: () => void;
  onEnterRename: () => void;
  onExitRename: () => void;
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
  onBackToList,
  onEnterRename,
  onExitRename,
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
      <div className="flex md:hidden flex-col border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20 shrink-0 h-14">
        {viewingSource ? (
          <>
            <div className="flex h-14 items-center gap-2 px-4 shrink-0 min-h-0">
              <div className="flex items-center gap-3 text-foreground overflow-hidden min-w-0 flex-1">
                <button
                  onClick={onBackToList}
                  className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
                  aria-label="Back to sources"
                >
                  <ChevronLeft className="w-5 h-5 shrink-0" />
                </button>
                <div className="min-w-0 flex-1 overflow-hidden">
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      spellCheck={false}
                      onChange={(e) => onRenameChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameValue.trim()) {
                          onRenameSubmit(viewingSource.id, renameValue.trim());
                        } else if (e.key === "Escape") {
                          onRenameChange(viewingSource.title);
                          onExitRename();
                        }
                      }}
                      onBlur={() => {
                        if (renameValue.trim()) {
                          onRenameSubmit(viewingSource.id, renameValue.trim());
                        } else {
                          onRenameChange(viewingSource.title);
                        }
                        onExitRename();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 font-display font-bold text-sm tracking-wide bg-transparent border-0 border-b border-border rounded-none px-0 py-0.5 text-foreground focus:outline-none focus:ring-0 focus:border-primary"
                      autoFocus
                      aria-label="Rename source"
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onRenameChange(viewingSource.title);
                        onEnterRename();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRenameChange(viewingSource.title);
                          onEnterRename();
                        }
                      }}
                      className="font-display font-bold text-sm tracking-wide truncate text-foreground cursor-text hover:opacity-80"
                      title="Click to rename"
                    >
                      {viewingSource.title}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(viewingSource.type === "WEB" ||
                  viewingSource.type === "PAPER" ||
                  viewingSource.type === "YOUTUBE") &&
                  viewingSource.url && (
                    <a
                      href={viewingSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-md text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors touch-manipulation"
                      title="Open in new tab"
                      aria-label="Open source in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                <button
                  type="button"
                  onClick={onCopy}
                  disabled={!canCopyOrDownload}
                  className="p-2 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-transform text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                  title="Copy content as Markdown"
                  aria-label="Copy content as Markdown"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={!canCopyOrDownload}
                  className="p-2 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-transform text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                  title="Download as Markdown file"
                  aria-label="Download as Markdown file"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-14 items-center gap-2 px-4 text-foreground">
            <FileStack className="w-4 h-4" />
            <span className="font-display font-bold text-sm tracking-wide uppercase">Sources</span>
            <span className="ml-2 text-xs text-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded-xl font-mono">
              {selectedCount}
            </span>
          </div>
        )}
      </div>

      {/* Desktop Header */}
      <div className="hidden md:flex flex-col border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10">
        {viewingSource ? (
          <>
            <div className="flex h-14 shrink-0 items-center gap-2 px-4 min-h-0">
              <div className="flex items-center gap-3 text-sidebar-foreground overflow-hidden min-w-0 flex-1">
                <button
                  onClick={onBackToList}
                  className="p-1 hover:bg-sidebar-accent active:bg-sidebar-accent/80 active:scale-[0.97] rounded-sm transition-transform text-sidebar-foreground/70 hover:text-sidebar-foreground shrink-0 touch-manipulation"
                >
                  <ChevronLeft className="w-5 h-5 shrink-0" />
                </button>
                <div className="min-w-0 flex-1 overflow-hidden">
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      spellCheck={false}
                      onChange={(e) => onRenameChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameValue.trim()) {
                          onRenameSubmit(viewingSource.id, renameValue.trim());
                        } else if (e.key === "Escape") {
                          onRenameChange(viewingSource.title);
                          onExitRename();
                        }
                      }}
                      onBlur={() => {
                        if (renameValue.trim()) {
                          onRenameSubmit(viewingSource.id, renameValue.trim());
                        } else {
                          onRenameChange(viewingSource.title);
                        }
                        onExitRename();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 font-display font-bold text-sm tracking-wide bg-transparent border-0 border-b border-border rounded-none px-0 py-0.5 text-sidebar-foreground focus:outline-none focus:ring-0 focus:border-primary"
                      autoFocus
                      aria-label="Rename source"
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onRenameChange(viewingSource.title);
                        onEnterRename();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRenameChange(viewingSource.title);
                          onEnterRename();
                        }
                      }}
                      className="font-display font-bold text-sm tracking-wide truncate text-left min-w-0 flex-1 cursor-text hover:opacity-80 hover:underline hover:decoration-dotted hover:underline-offset-2 transition-opacity outline-none focus:outline-none focus:opacity-80 bg-transparent"
                      title="Click to rename"
                    >
                      {viewingSource.title}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(viewingSource.type === "WEB" ||
                  viewingSource.type === "PAPER" ||
                  viewingSource.type === "YOUTUBE") &&
                  viewingSource.url && (
                    <a
                      href={viewingSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors touch-manipulation"
                      title="Open in new tab"
                      aria-label="Open source in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                <button
                  type="button"
                  onClick={onCopy}
                  disabled={!canCopyOrDownload}
                  className="p-2 hover:bg-sidebar-accent active:bg-sidebar-accent/80 active:scale-[0.97] rounded-sm transition-transform text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                  title="Copy content as Markdown"
                  aria-label="Copy content as Markdown"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={!canCopyOrDownload}
                  className="p-2 hover:bg-sidebar-accent active:bg-sidebar-accent/80 active:scale-[0.97] rounded-sm transition-transform text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
                  title="Download as Markdown file"
                  aria-label="Download as Markdown file"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2 text-sidebar-foreground">
              <FileStack className="w-4 h-4 shrink-0" />
              <span className="font-display font-bold text-sm tracking-wide uppercase">
                Sources
              </span>
              <span className="ml-2 text-xs text-muted-foreground bg-sidebar-accent px-1.5 py-0.5 rounded-xl font-mono">
                {selectedCount}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-sidebar-accent active:bg-sidebar-accent/80 active:scale-[0.97] rounded-sm transition-transform text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center justify-center shrink-0 touch-manipulation"
              aria-label="Close Sources panel"
            >
              <ChevronLeft className="w-5 h-5 shrink-0" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};
