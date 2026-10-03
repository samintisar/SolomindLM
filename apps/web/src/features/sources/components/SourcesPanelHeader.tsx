import { ArrowLeft, ChevronLeft, Copy, Download, ExternalLink } from "lucide-react";
import React from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import { Input } from "@/shared/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Source } from "@/shared/types";
import { hasExternalSourceUrl } from "../utils/sourceTypes";

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
}) => {
  const titleRef = React.useRef<HTMLButtonElement>(null);
  // Enter/Escape already settle the rename; the blur that follows the input
  // unmounting must not submit it a second time (or submit after Escape).
  const renameSettledRef = React.useRef(false);
  // Set when a keystroke ends the rename, so focus returns to the title button
  // (not when the rename ended by clicking elsewhere).
  const returnFocusRef = React.useRef(false);

  React.useEffect(() => {
    if (isRenaming) {
      renameSettledRef.current = false;
      returnFocusRef.current = false;
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      titleRef.current?.focus();
    }
  }, [isRenaming]);

  if (!viewingSource) {
    return (
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <h2 className="font-display text-sm font-bold tracking-wide uppercase">Sources</h2>
        <Badge variant="secondary" aria-label={`${selectedCount} selected`}>
          {selectedCount}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto hidden md:inline-flex"
          aria-label="Close sources panel"
          onClick={onClose}
        >
          <ChevronLeft />
        </Button>
      </div>
    );
  }

  const submitRename = () => {
    const next = renameValue.trim();
    if (next === viewingSource.title) onExitRename();
    else onRenameSubmit(viewingSource.id, next);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && renameValue.trim()) {
      // Focus moves to the title button during this keydown; without this the Enter's
      // default action would "click" that button and reopen the rename.
      e.preventDefault();
      renameSettledRef.current = true;
      returnFocusRef.current = true;
      submitRename();
    } else if (e.key === "Escape") {
      renameSettledRef.current = true;
      returnFocusRef.current = true;
      onExitRename();
    }
  };

  const handleRenameBlur = () => {
    if (renameSettledRef.current) return;
    renameSettledRef.current = true;
    if (renameValue.trim()) submitRename();
    else onExitRename();
  };

  const startRename = () => {
    onRenameChange(viewingSource.title);
    onEnterRename();
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Back to sources"
        onClick={onBackToList}
      >
        <ArrowLeft />
      </Button>
      {isRenaming ? (
        <Input
          autoFocus
          aria-label="Rename source"
          spellCheck={false}
          className="min-w-0 flex-1"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
        />
      ) : (
        <Button
          ref={titleRef}
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 justify-start"
          aria-label={`Rename ${viewingSource.title}`}
          onClick={startRename}
        >
          <span className="truncate font-display text-sm font-bold tracking-wide">
            {viewingSource.title}
          </span>
        </Button>
      )}
      <ButtonGroup variant="tray" aria-label="Source actions" className="shrink-0">
        {hasExternalSourceUrl(viewingSource) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-sm">
                <a
                  href={viewingSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open source in new tab"
                >
                  <ExternalLink />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Copy content as Markdown"
                onClick={onCopy}
                disabled={!canCopyOrDownload}
              >
                <Copy />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Copy as Markdown</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Download as Markdown file"
                onClick={onDownload}
                disabled={!canCopyOrDownload}
              >
                <Download />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Download as Markdown</TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </div>
  );
};
