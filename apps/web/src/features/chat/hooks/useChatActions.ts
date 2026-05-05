import { useCallback } from "react";
import { exportAsMarkdown } from "../utils/exportChat";
import { useSaveChat } from "../services/userNotesApi";
import { useUpdateNotebook } from "../../notebooks/services/notebooksApi";
import { useToast } from "@/shared/contexts/useToast";
import type { Message, Note, ChatSettings } from "@/shared/types/index";

interface UseChatActionsOptions {
  notebookId?: string | null;
  notebookTitle: string;
  messages: Message[];
  onSaveChatOptimistic?: (payload: { notebookId: string; note: Note } | null) => void;
}

export function useChatActions(options: UseChatActionsOptions) {
  const { notebookId, notebookTitle, messages, onSaveChatOptimistic } = options;
  const { success, error: toastError } = useToast();
  const saveChat = useSaveChat();
  const updateNotebook = useUpdateNotebook();

  const handleExportChat = useCallback(() => {
    if (messages.length === 0) {
      toastError("No messages to export");
      return;
    }
    exportAsMarkdown(messages, notebookTitle);
    success("Chat exported successfully");
  }, [messages, notebookTitle, toastError, success]);

  const handleSaveToNote = useCallback(async () => {
    if (messages.length === 0) {
      toastError("No messages to save");
      return;
    }
    if (!notebookId) {
      toastError("No notebook selected");
      return;
    }

    const placeholderNote: Note = {
      id: `pending-save-${Date.now()}`,
      title: "Saved chat",
      preview: "Note · Saved Chat",
      type: "note",
      noteType: "chat",
      status: "generating",
      content: undefined,
      messages: [],
      metadata: { messageCount: messages.length, savedAt: new Date().toISOString() },
    };
    onSaveChatOptimistic?.({ notebookId, note: placeholderNote });
    try {
      const serializedMessages = messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp,
      }));
      await saveChat({ notebookId, messages: serializedMessages, messageCount: messages.length });
    } catch (error) {
      console.error("Failed to save chat:", error);
    } finally {
      onSaveChatOptimistic?.(null);
    }
  }, [messages, notebookId, onSaveChatOptimistic, saveChat, toastError]);

  const handleSaveChatConfig = useCallback(
    async (settings: ChatSettings, opts?: { silentSuccess?: boolean }) => {
      if (!notebookId) return;
      try {
        await updateNotebook(notebookId, { chatSettings: settings });
        if (!opts?.silentSuccess) {
          success("Chat settings saved");
        }
      } catch (_e) {
        toastError("Failed to save chat settings");
      }
    },
    [notebookId, updateNotebook, success, toastError]
  );

  return { handleExportChat, handleSaveToNote, handleSaveChatConfig };
}
