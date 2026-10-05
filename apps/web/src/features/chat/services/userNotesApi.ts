import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import {
  patchNoteInNotesCache,
  removeNoteFromNotesCache,
} from "@/features/studio/services/notesCache";
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
    (localStore, { id, ...updates }) => {
      patchNoteInNotesCache(localStore, id, updates);
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
    (localStore, { id }) => {
      removeNoteFromNotesCache(localStore, id);
    }
  );

  return async (noteId: string) => {
    await remove({ id: noteId as Id<"notes"> });
  };
}
