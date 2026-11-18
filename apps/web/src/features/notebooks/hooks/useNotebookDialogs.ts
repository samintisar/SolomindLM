import { useCallback, useState } from "react";
import { useErrorToast } from "@/shared/hooks/useErrorToast";
import { useCreateFolder } from "../services/foldersApi";
import { useCreateNotebook } from "../services/notebooksApi";
import { useNotebookContext } from "../useNotebookContext";

interface NotebookFormData {
  title: string;
  coverColor: string;
  icon: string;
}

interface FolderFormData {
  name: string;
  color: string;
  icon: string;
}

interface UseNotebookDialogsOptions {
  /** New notebooks are created in this folder; omit to create them at the top level. */
  folderId?: string;
}

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.includes("Unauthorized") || message.includes("Unauthenticated");
}

/**
 * State and save handlers for the notebook and folder dialogs on the home and folder pages:
 * customize/create notebook, move notebook to folder, customize/create folder.
 */
export function useNotebookDialogs({ folderId }: UseNotebookDialogsOptions = {}) {
  const { updateNotebook, updateFolder, onRequireAuth } = useNotebookContext();
  const createNotebook = useCreateNotebook();
  const createFolder = useCreateFolder();
  const { handleLimitError } = useErrorToast();

  const [customizingId, setCustomizingId] = useState<string | null>(null);
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
  const [movingNotebookId, setMovingNotebookId] = useState<string | null>(null);
  const [folderCustomizingId, setFolderCustomizingId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const openCustomize = useCallback((id: string) => setCustomizingId(id), []);
  const openCreateNotebook = useCallback(() => setIsCreatingNotebook(true), []);
  const closeCustomize = useCallback(() => {
    setCustomizingId(null);
    setIsCreatingNotebook(false);
  }, []);

  const openMoveToFolder = useCallback((notebookId: string) => setMovingNotebookId(notebookId), []);
  const closeMoveToFolder = useCallback(() => setMovingNotebookId(null), []);

  const openFolderCustomize = useCallback((id: string) => setFolderCustomizingId(id), []);
  const openCreateFolder = useCallback(() => setIsCreatingFolder(true), []);
  const closeFolderCustomize = useCallback(() => {
    setFolderCustomizingId(null);
    setIsCreatingFolder(false);
  }, []);

  // Failures other than limit and auth errors propagate to the dialog, which reports them and
  // stays open for a retry.
  const saveNotebook = async (data: NotebookFormData) => {
    if (!isCreatingNotebook) {
      await updateNotebook(customizingId!, data);
      closeCustomize();
      return;
    }
    try {
      await createNotebook({
        title: data.title,
        coverColor: data.coverColor,
        icon: data.icon,
        folderId,
      });
      closeCustomize();
    } catch (error) {
      console.error("Failed to create notebook:", error);
      const handled = await handleLimitError(error);
      if (handled.isLimitError) return;
      if (isAuthError(error)) {
        closeCustomize();
        onRequireAuth("You need to sign in to create a notebook.");
        return;
      }
      throw error;
    }
  };

  const saveFolder = async (data: FolderFormData) => {
    if (!isCreatingFolder) {
      await updateFolder(folderCustomizingId!, data);
      closeFolderCustomize();
      return;
    }
    try {
      await createFolder({ name: data.name, color: data.color, icon: data.icon });
      closeFolderCustomize();
    } catch (error) {
      console.error("Failed to create folder:", error);
      if (isAuthError(error)) {
        closeFolderCustomize();
        onRequireAuth("You need to sign in to create a folder.");
        return;
      }
      throw error;
    }
  };

  return {
    customizingId,
    isCreatingNotebook,
    openCustomize,
    openCreateNotebook,
    closeCustomize,
    saveNotebook,
    movingNotebookId,
    openMoveToFolder,
    closeMoveToFolder,
    folderCustomizingId,
    isCreatingFolder,
    openFolderCustomize,
    openCreateFolder,
    closeFolderCustomize,
    saveFolder,
  };
}
