import { MoreVertical, Pencil, Play, Trash2 } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Progress } from "@/shared/components/ui/progress";
import { isAudioNote, isAudioOverviewNote, type Note } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { useJustFinished } from "../hooks/useJustFinished";
import { studioTypeStyle } from "../studioTypeStyle";
import {
  getStudioGeneratingListLines,
  type StudioGeneratingListLines,
} from "../utils/studioGenerationLabels";
import { NoteIcon } from "./NoteIcon";

interface NoteItemProps {
  note: Note;
  isEditing: boolean;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onClick: () => void;
  onDelete: () => void;
  onPlayAudio?: (note: Note) => void;
}

/** Step text, percentage and progress bar for a generating row. The step text rolls in as it changes. */
function GeneratingStatus({
  lines,
  preview,
}: {
  lines: StudioGeneratingListLines;
  preview: string;
}) {
  return (
    <div className="mt-2 min-w-0 space-y-2">
      {preview ? (
        <p className="truncate font-serif text-sm leading-snug text-muted-foreground">{preview}</p>
      ) : null}
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p
          key={lines.primary}
          className="min-w-0 flex-1 truncate font-serif text-xs leading-snug text-foreground animate-in fade-in slide-in-from-bottom-1 duration-300"
        >
          {lines.primary}
        </p>
        {lines.progressPercent !== null ? (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {lines.progressPercent}%
          </span>
        ) : null}
      </div>
      <Progress value={lines.progressPercent} size="sm" glint aria-label="Generation progress" />
    </div>
  );
}

/**
 * One Saved row: type tile, title (inline rename) and preview, plus play and a ⋮ menu.
 * While generating, a Sheen in the type colour sweeps across it; when it finishes it glows once.
 */
export const NoteItem: React.FC<NoteItemProps> = ({
  note,
  isEditing,
  editTitle,
  onEditTitleChange,
  onEditStart,
  onEditSave,
  onEditCancel: _onEditCancel,
  onEditKeyDown,
  onClick,
  onDelete,
  onPlayAudio,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set when "Rename" is picked. The edit starts only once the menu has fully closed: while the
  // menu animates out it is still interactive, and a pointermove over it would focus an item,
  // blurring the new input and ending the edit at once.
  const renameRequestedRef = useRef(false);
  // Set when Enter/Escape ends a rename, so focus returns to the menu trigger (not when the
  // rename ended by clicking elsewhere).
  const returnFocusRef = useRef(false);
  const justFinished = useJustFinished(note.status);

  useEffect(() => {
    if (isEditing) {
      returnFocusRef.current = false;
      inputRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isEditing]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") returnFocusRef.current = true;
    onEditKeyDown(e);
  };

  const isGenerating = note.status === "generating";
  const generatingLines = isGenerating ? getStudioGeneratingListLines(note) : null;
  const { toneClass } = studioTypeStyle(note);

  const canPlayInline =
    Boolean(onPlayAudio) &&
    !isGenerating &&
    ((isAudioOverviewNote(note) && Boolean(note.audioUrl?.trim())) ||
      (note.type === "audio" && isAudioNote(note) && Boolean(note.metadata.audioUrl?.trim())));

  return (
    <Card
      variant={isGenerating || isEditing ? "flush" : "interactive"}
      data-testid="studio-note-card"
      aria-busy={isGenerating || undefined}
      className="relative"
    >
      {isGenerating ? (
        <span
          aria-hidden
          className={cn("studio-sheen pointer-events-none absolute inset-0", toneClass)}
        />
      ) : null}
      {justFinished ? (
        <span
          aria-hidden
          data-slot="finish-glow"
          className="pointer-events-none absolute inset-0 animate-studio-glow rounded-2xl ring-2 ring-success/40 ring-inset"
        />
      ) : null}
      <div className="relative flex items-start gap-2">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
            <NoteIcon note={note} />
            <Input
              ref={inputRef}
              aria-label="Edit note title"
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              onBlur={onEditSave}
              onKeyDown={handleTitleKeyDown}
            />
          </div>
        ) : isGenerating && generatingLines ? (
          <div
            role="group"
            aria-label={`${note.title}, ${generatingLines.primary}`}
            className="flex min-w-0 flex-1 items-start gap-3 p-3"
          >
            <NoteIcon note={note} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-sm font-bold leading-tight text-foreground">
                {note.title}
              </p>
              <GeneratingStatus lines={generatingLines} preview={note.preview} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="group flex min-w-0 flex-1 items-start gap-3 p-3 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <NoteIcon note={note} popped={justFinished} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-sm font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                {note.title}
              </span>
              <span
                className={cn(
                  "mt-1 block truncate font-serif text-xs tabular-nums text-muted-foreground",
                  justFinished && "animate-in fade-in duration-500"
                )}
              >
                {note.preview}
              </span>
            </span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5 py-3 pr-3">
          {canPlayInline ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Play audio overview"
              onClick={() => onPlayAudio?.(note)}
            >
              <Play className="fill-current text-studio-audio" />
            </Button>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={triggerRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="More options"
                title="More options"
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              data-note-item-menu
              onCloseAutoFocus={(e) => {
                if (renameRequestedRef.current) {
                  renameRequestedRef.current = false;
                  e.preventDefault();
                  onEditStart();
                }
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  renameRequestedRef.current = true;
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
};
