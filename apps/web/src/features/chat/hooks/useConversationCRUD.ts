import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";

export function useConversationsForNotebook(notebookId: string | null) {
  return useQuery(
    api.chat.conversations.listForNotebook,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
}

export function useConversationCRUD(notebookId: string | null) {
  const createConversation = useMutation(api.chat.messages.createConversation);
  const renameConversation = useMutation(api.chat.messages.renameConversation);
  const deleteConversation = useMutation(api.chat.index.remove);
  const conversations = useConversationsForNotebook(notebookId);

  const handleCreate = useCallback(async () => {
    if (!notebookId) return null;
    const result = await createConversation({
      notebookId: notebookId as Id<"notebooks">,
    });
    return result?._id ?? null;
  }, [notebookId, createConversation]);

  const handleRename = useCallback(
    (conversationId: string, title: string) =>
      renameConversation({
        conversationId: conversationId as Id<"conversations">,
        title,
      }),
    [renameConversation]
  );

  const handleDelete = useCallback(
    (conversationId: string) =>
      deleteConversation({
        conversationId: conversationId as Id<"conversations">,
      }),
    [deleteConversation]
  );

  return { conversations, handleCreate, handleRename, handleDelete };
}
