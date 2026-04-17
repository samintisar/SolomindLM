import { useState, useCallback } from "react";
import { FolderItem } from "@/shared/types/index";

export interface UseFolderHandlersProps {
  onUpdateFolder?: (id: string, updates: Partial<FolderItem>) => void;
  onDeleteFolder?: (id: string) => void;
}

export interface UseFolderHandlersReturn {
  // State
  folderActiveMenuId: string | null;
  folderCustomizingId: string | null;
  isCreatingFolder: boolean;
  // Handlers
  openFolderCustomize: (id: string) => void;
  closeFolderCustomize: () => void;
  openCreateFolder: () => void;
  setFolderActiveMenuId: (id: string | null) => void;
}

export function useFolderHandlers(_props: UseFolderHandlersProps = {}): UseFolderHandlersReturn {
  const [folderActiveMenuId, setFolderActiveMenuId] = useState<string | null>(null);
  const [folderCustomizingId, setFolderCustomizingId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const openFolderCustomize = useCallback((id: string) => {
    setFolderCustomizingId(id);
    setFolderActiveMenuId(null);
  }, []);

  const closeFolderCustomize = useCallback(() => {
    setFolderCustomizingId(null);
    setIsCreatingFolder(false);
  }, []);

  const openCreateFolder = useCallback(() => {
    setIsCreatingFolder(true);
  }, []);

  return {
    folderActiveMenuId,
    setFolderActiveMenuId,
    folderCustomizingId,
    isCreatingFolder,
    openFolderCustomize,
    closeFolderCustomize,
    openCreateFolder,
  };
}
