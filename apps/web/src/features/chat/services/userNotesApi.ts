import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import { useCallback, useMemo } from "react";
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
  const updateMutation = useMutation(api.notes.userNotes.update);
  const update = useMemo(
    () =>
      updateMutation.withOptimisticUpdate((localStore, { id, ...updates }) => {
        patchNoteInNotesCache(localStore, id, updates);
      }),
    [updateMutation]
  );

  return useCallback(
    async (noteId: string, updates: { title?: string; content?: string }) => {
      await update({
        id: noteId as Id<"notes">,
        ...updates,
      });
    },
    [update]
  );
}

/**
 * Delete a note by ID with optimistic update
 */
export function useDeleteUserNote() {
  const removeMutation = useMutation(api.notes.userNotes.remove);
  const remove = useMemo(
    () =>
      removeMutation.withOptimisticUpdate((localStore, { id }) => {
        removeNoteFromNotesCache(localStore, id);
      }),
    [removeMutation]
  );

  return useCallback(
    async (noteId: string) => {
      await remove({ id: noteId as Id<"notes"> });
    },
    [remove]
  );
}
