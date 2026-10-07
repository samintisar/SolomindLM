import { PenTool, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/shared/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";
import { Note, StudioTool } from "@/shared/types/index";
import { NoteItem } from "./NoteItem";
import { ToolGrid } from "./ToolGrid";

interface NoteListViewProps {
  tools: StudioTool[];
  notes: Note[];
  onToolClick: (toolId: string) => void;
  onNoteClick: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onPlayAudio?: (note: Note) => void;
  editingId: string | null;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onEditStart: (note: Note) => void;
  onEditSave: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * NoteListView component displays the tool grid and saved notes list.
 * This is shown when no note is currently active.
 */
export const NoteListView: React.FC<NoteListViewProps> = ({
  tools,
  notes,
  onToolClick,
  onNoteClick,
  onDeleteNote,
  onPlayAudio,
  editingId,
  editTitle,
  onEditTitleChange,
  onEditStart,
  onEditSave,
  onEditKeyDown,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(q));
  }, [notes, searchQuery]);

  return (
    <div className="p-4 space-y-8">
      <ToolGrid tools={tools} onToolClick={onToolClick} />

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest font-sans">
            Saved
          </h3>
        </div>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search notes"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
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
                onEditKeyDown={onEditKeyDown}
                onClick={() => onNoteClick(note)}
                onDelete={() => onDeleteNote(note)}
                onPlayAudio={onPlayAudio}
              />
            ))}
            {filteredNotes.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PenTool />
                  </EmptyMedia>
                  <EmptyDescription>
                    {searchQuery.trim()
                      ? "No notes match your search."
                      : "No saved notes yet. Create one to get started!"}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
