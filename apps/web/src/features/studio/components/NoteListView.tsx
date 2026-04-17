import React, { useState, useMemo } from "react";
import { PenTool, Search } from "lucide-react";
import { StudioTool, Note } from "@/shared/types/index";
import { ToolGrid } from "./ToolGrid";
import { NoteItem } from "./NoteItem";

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
  activeNoteId: _activeNoteId,
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
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(q));
  }, [notes, searchQuery]);

  // Handle click outside to close menus (portal menu has data-note-item-menu so clicks on Rename/Delete count as inside)
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const insideMenu = target.closest(".kebab-menu") || target.closest("[data-note-item-menu]");
      if (activeMenuId && !insideMenu) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-serif shadow-xs"
          />
        </div>
        <div className="flex flex-col gap-2">
          {notes.length > 0 && (
            <div className="text-xs text-muted-foreground px-1 mb-1 font-sans">
              {filteredNotes.length} {searchQuery.trim() ? `of ${notes.length}` : ""} items
            </div>
          )}
          <div className="space-y-3">
            {filteredNotes.map((note) => (
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
            {filteredNotes.length === 0 && (
              <div className="text-center py-8">
                <PenTool className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? "No notes match your search."
                    : "No saved notes yet. Create one to get started!"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
