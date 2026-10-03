import { useCallback, useState } from "react";
import { FolderItem } from "@/shared/types/index";

export interface UseFolderHandlersProps {
  onUpdateFolder?: (id: string, updates: Partial<FolderItem>) => void;
  onDeleteFolder?: (id: string) => void;
}

export interface UseFolderHandlersReturn {
  // State
  folderCustomizingId: string | null;
  isCreatingFolder: boolean;
  // Handlers
  openFolderCustomize: (id: string) => void;
  closeFolderCustomize: () => void;
  openCreateFolder: () => void;
}

export function useFolderHandlers(_props: UseFolderHandlersProps = {}): UseFolderHandlersReturn {
  const [folderCustomizingId, setFolderCustomizingId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const openFolderCustomize = useCallback((id: string) => {
    setFolderCustomizingId(id);
  }, []);

  const closeFolderCustomize = useCallback(() => {
    setFolderCustomizingId(null);
    setIsCreatingFolder(false);
  }, []);

  const openCreateFolder = useCallback(() => {
    setIsCreatingFolder(true);
  }, []);

  return {
    folderCustomizingId,
    isCreatingFolder,
    openFolderCustomize,
    closeFolderCustomize,
    openCreateFolder,
  };
}
