import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import type { UserNote } from "@/shared/types/index";

/**
 * Map a database note response to the frontend UserNote interface
 */
function mapDatabaseNoteToUserNote(dbNote: any): UserNote {
  const isChat = dbNote.type === "chat";
  const messageCount = dbNote.messageCount || 0;
  const createdAt = dbNote.createdAt ?? Date.now();
  const createdDate = new Date(createdAt);

  return {
    id: dbNote._id,
    title: dbNote.title,
    preview: isChat ? "Note · Saved Chat" : dbNote.content?.substring(0, 100) || "Empty note",
    type: "note",
    noteType: dbNote.type,
    content: dbNote.content,
    messages: dbNote.messages,
    status: dbNote.status,
    metadata: {
      messageCount,
      conversationId: dbNote.conversationId,
      savedAt: createdDate.toISOString(),
      ...dbNote.metadata,
    },
  };
}

/**
 * Get all notes for a notebook
 */
export function useUserNotes(notebookId: string | null) {
  const notes = useQuery(
    api.notes.userNotes.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return notes?.map(mapDatabaseNoteToUserNote);
}

/**
 * Get a specific note by ID
 */
export function useUserNote(noteId: string | null) {
  const note = useQuery(api.notes.userNotes.get, noteId ? { id: noteId as Id<"notes"> } : "skip");
  return note ? mapDatabaseNoteToUserNote(note) : null;
}

/**
 * Save a chat conversation as a note with AI-generated title
 */
export function useSaveChat() {
  const saveChat = useAction(api.notes.userNotes.saveChat);

  return async (params: {
    notebookId: string;
    messages: any[];
    messageCount: number;
    conversationId?: string;
  }): Promise<UserNote> => {
    const result = await saveChat({
      notebookId: params.notebookId as Id<"notebooks">,
      messages: params.messages,
      messageCount: params.messageCount,
      conversationId: params.conversationId as Id<"conversations"> | undefined,
    });

    return mapDatabaseNoteToUserNote(result);
  };
}

/**
 * Update a note (title or content) with optimistic update
 */
export function useUpdateUserNote() {
  const update = useMutation(api.notes.userNotes.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title, content } = args;

      // Read the current note
      const note = localStore.getQuery(api.notes.userNotes.get, { id });
      if (note) {
        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (Object.keys(updates).length > 0) {
          localStore.setQuery(api.notes.userNotes.get, { id }, { ...note, ...updates });
        }

        // Update list view when title changes
        if (title !== undefined) {
          const listResult = localStore.getQuery(api.notes.userNotes.list, {
            notebookId: note.notebookId,
          });
          if (listResult) {
            localStore.setQuery(
              api.notes.userNotes.list,
              { notebookId: note.notebookId },
              listResult.map((n: { _id: string; [key: string]: unknown }) =>
                n._id === id ? { ...n, title } : n
              )
            );
          }
        }
      }
    }
  );

  return async (noteId: string, updates: { title?: string; content?: string }) => {
    await update({
      id: noteId as Id<"notes">,
      ...updates,
    });
  };
}

/**
 * Delete a note by ID with optimistic update
 */
export function useDeleteUserNote() {
  const remove = useMutation(api.notes.userNotes.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Read the current note to get its notebookId
      const note = localStore.getQuery(api.notes.userNotes.get, { id: args.id });
      if (note) {
        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.notes.userNotes.list, {
          notebookId: note.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.notes.userNotes.list,
            { notebookId: note.notebookId },
            listResult.filter((n: { _id: string }) => n._id !== args.id)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(api.notes.userNotes.get, { id: args.id }, null);
    }
  );

  return async (noteId: string) => {
    await remove({ id: noteId as Id<"notes"> });
  };
}
