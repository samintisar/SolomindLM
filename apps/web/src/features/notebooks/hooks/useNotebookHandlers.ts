import { useCallback, useState } from "react";
import { NotebookItem } from "@/shared/types/index";

export interface UseNotebookHandlersProps {
  notebooks: NotebookItem[];
  onUpdateNotebook: (id: string, updates: Partial<NotebookItem>) => void;
  onDeleteNotebook: (id: string) => void;
}

export interface UseNotebookHandlersReturn {
  // State
  customizingId: string | null;
  movingNotebookId: string | null;
  isCreatingNotebook: boolean;
  // Handlers
  openCustomize: (id: string) => void;
  closeCustomize: () => void;
  openMoveToFolder: (notebookId: string) => void;
  closeMoveToFolder: () => void;
  openCreateNotebook: () => void;
}

export function useNotebookHandlers({
  onUpdateNotebook: _onUpdateNotebook,
  onDeleteNotebook: _onDeleteNotebook,
}: UseNotebookHandlersProps): UseNotebookHandlersReturn {
  const [customizingId, setCustomizingId] = useState<string | null>(null);
  const [movingNotebookId, setMovingNotebookId] = useState<string | null>(null);
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);

  const openCustomize = useCallback((id: string) => {
    setCustomizingId(id);
  }, []);

  const closeCustomize = useCallback(() => {
    setCustomizingId(null);
    setIsCreatingNotebook(false);
  }, []);

  const openCreateNotebook = useCallback(() => {
    setIsCreatingNotebook(true);
  }, []);

  const openMoveToFolder = useCallback((notebookId: string) => {
    setMovingNotebookId(notebookId);
  }, []);

  const closeMoveToFolder = useCallback(() => {
    setMovingNotebookId(null);
  }, []);

  return {
    customizingId,
    movingNotebookId,
    isCreatingNotebook,
    openCustomize,
    closeCustomize,
    openMoveToFolder,
    closeMoveToFolder,
    openCreateNotebook,
  };
}
