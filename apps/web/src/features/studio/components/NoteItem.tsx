import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Note } from '@/shared/types/index';
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
  onEditCancel,
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

  return (
    <div
      onClick={onClick}
      className={`relative bg-card border-l-4 border-l-primary border-y border-r border-border p-3 pl-4 shadow-sm transition-shadow group rounded-r-sm ${
        isGenerating
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:shadow-md cursor-pointer'
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
              <h4 className={`text-sm font-bold text-foreground font-serif truncate leading-tight mb-1 transition-colors ${
                isGenerating ? '' : 'group-hover:text-primary'
              }`}>{note.title}</h4>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {note.status === 'generating' ? (
                <span className="font-mono tracking-tight text-primary italic">Generating...</span>
              ) : (
                <span className="font-mono tracking-tight">{note.preview}</span>
              )}
            </div>
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
