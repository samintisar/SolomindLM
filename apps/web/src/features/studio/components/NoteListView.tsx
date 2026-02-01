import React, { useState } from 'react';
import { StudioTool, Note } from '@/shared/types/index';
import { ToolGrid } from './ToolGrid';
import { NoteItem } from './NoteItem';

interface NoteListViewProps {
  tools: StudioTool[];
  notes: Note[];
  activeNoteId: string | null;
  width: number;
  onToolClick: (toolId: string) => void;
  onNoteClick: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onPlayAudio?: (note: Note) => void;
  editingId: string | null;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onEditStart: (note: Note) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * NoteListView component displays the tool grid and saved notes list.
 * This is shown when no note is currently active.
 */
export const NoteListView: React.FC<NoteListViewProps> = ({
  tools,
  notes,
  activeNoteId,
  width,
  onToolClick,
  onNoteClick,
  onDeleteNote,
  onPlayAudio,
  editingId,
  editTitle,
  onEditTitleChange,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditKeyDown,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Handle click outside to close menus (portal menu has data-note-item-menu so clicks on Rename/Delete count as inside)
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const insideMenu =
        target.closest('.kebab-menu') || target.closest('[data-note-item-menu]');
      if (activeMenuId && !insideMenu) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuId]);

  return (
    <div className="p-4 space-y-8">
      <ToolGrid tools={tools} onToolClick={onToolClick} width={width} />

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest font-sans">
            Saved
          </h3>
        </div>
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              isEditing={editingId === note.id}
              editTitle={editTitle}
              onEditTitleChange={onEditTitleChange}
              onEditStart={() => onEditStart(note)}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
              onEditKeyDown={onEditKeyDown}
              onClick={() => onNoteClick(note)}
              onDelete={() => onDeleteNote(note)}
              onPlayAudio={onPlayAudio}
              isMenuOpen={activeMenuId === note.id}
              onMenuToggle={() => setActiveMenuId(activeMenuId === note.id ? null : note.id)}
              onMenuClose={() => setActiveMenuId(null)}
            />
          ))}
          {notes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No saved notes yet. Create one to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
