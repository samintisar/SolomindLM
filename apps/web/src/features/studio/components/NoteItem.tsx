import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Note } from '@/shared/types/index';
import { getStudioGeneratingListLines } from '../utils/studioGenerationLabels';
import { NoteIcon } from './NoteIcon';

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
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
}

/**
 * NoteItem component renders an individual note card in the notes list.
 * Includes icon, title with inline editing, status badge, and action menu.
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
  isMenuOpen,
  onMenuToggle,
  onMenuClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Position dropdown via portal so it isn't clipped by sidebar overflow-y-auto
  useLayoutEffect(() => {
    if (!isMenuOpen || !menuButtonRef.current) {
      setMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      if (menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right,
        });
      }
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isMenuOpen]);

  const isGenerating = note.status === 'generating';
  const generatingLines = isGenerating ? getStudioGeneratingListLines(note) : null;

  return (
    <div
      onClick={() => {
        if (!isGenerating) onClick();
      }}
      aria-busy={isGenerating ? true : undefined}
      aria-label={
        isGenerating && generatingLines
          ? `${note.title}, ${generatingLines.primary}`
          : undefined
      }
      className={`relative rounded-sm border border-border p-3 transition-[box-shadow,transform] duration-300 ${
        isGenerating
          ? 'cursor-not-allowed overflow-hidden bg-card/95 shadow-sm'
          : 'bg-card shadow-sm hover:shadow-md cursor-pointer group'
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 flex gap-3 min-w-0">
          <NoteIcon note={note} onPlayAudio={onPlayAudio} />
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => onEditTitleChange(e.target.value)}
                onBlur={onEditSave}
                onKeyDown={onEditKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-transparent border-b border-primary text-sm font-bold text-foreground font-serif focus:outline-none mb-1 p-0 rounded-none"
                aria-label="Edit note title"
              />
            ) : (
              <h4
                className={`text-sm font-bold text-foreground font-serif truncate leading-tight transition-colors ${
                  isGenerating ? 'mb-0' : 'mb-1 group-hover:text-primary'
                }`}
              >
                {note.title}
              </h4>
            )}
            {isGenerating && generatingLines ? (
              <div className="relative z-1 mt-2 min-w-0 space-y-2">
                {note.preview ? (
                  <p className="text-sm leading-snug text-muted-foreground font-mono tracking-tight truncate">
                    {note.preview}
                  </p>
                ) : null}
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">
                    {generatingLines.primary}
                  </p>
                  {generatingLines.progressPercent !== null ? (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {generatingLines.progressPercent}%
                    </span>
                  ) : null}
                </div>
                {generatingLines.progressPercent !== null ? (
                  <div
                    className="relative h-1 w-full overflow-hidden rounded-full bg-muted/80"
                    role="progressbar"
                    aria-valuenow={generatingLines.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{ width: `${generatingLines.progressPercent}%` }}
                    />
                  </div>
                ) : (
                  <div
                    className="studio-generating-progress-indeterminate relative h-1 w-full rounded-full bg-muted/80"
                    aria-hidden
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono tracking-tight">{note.preview}</span>
              </div>
            )}
          </div>
        </div>
        <div className="relative kebab-menu shrink-0">
          <button
            ref={menuButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
            className="text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-secondary transition-colors flex items-center justify-center shrink-0"
            aria-label="More options"
            aria-expanded={isMenuOpen}
          >
            <MoreVertical className="w-3.5 h-3.5 shrink-0" />
          </button>
          {isMenuOpen &&
            menuPosition &&
            createPortal(
              <div
                data-note-item-menu
                className="fixed w-36 bg-popover border border-border shadow-lg rounded-md z-100 py-1 animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: menuPosition.top,
                  right: menuPosition.right,
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditStart();
                    onMenuClose();
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent text-popover-foreground flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" /> Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                    onMenuClose();
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                </button>
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  );
};
