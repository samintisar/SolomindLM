import { useState, useCallback, useEffect, useMemo } from "react";
import type { FolderItem, NotebookItem } from "@/shared/types/index";
import { useFolderNotebooks } from "../services/foldersApi";

export interface UseFolderExpansionProps {
  folders?: FolderItem[];
}

export interface UseFolderExpansionReturn {
  expandedFolderId: string | null;
  folderNotebooks: Record<string, NotebookItem[]>;
  loadingFolderNotebooks: Set<string>;
  /** Toggles expansion; notebook data loads reactively via Convex. */
  toggleFolderExpansion: (folderId: string) => void;
}

export function useFolderExpansion({
  folders = [],
}: UseFolderExpansionProps): UseFolderExpansionReturn {
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  const notebooksQuery = useFolderNotebooks(expandedFolderId);

  useEffect(() => {
    if (!expandedFolderId || folders.length === 0) return;
    const exists = folders.some((f) => f.id === expandedFolderId);
    if (!exists) {
      setExpandedFolderId(null);
    }
  }, [folders, expandedFolderId]);

  const folderNotebooks = useMemo((): Record<string, NotebookItem[]> => {
    if (!expandedFolderId) return {};
    if (notebooksQuery === undefined) return {};
    return { [expandedFolderId]: notebooksQuery as NotebookItem[] };
  }, [expandedFolderId, notebooksQuery]);

  const loadingFolderNotebooks = useMemo(() => {
    if (expandedFolderId === null) return new Set<string>();
    if (notebooksQuery === undefined) return new Set([expandedFolderId]);
    return new Set<string>();
  }, [expandedFolderId, notebooksQuery]);

  const toggleFolderExpansion = useCallback((folderId: string) => {
    setExpandedFolderId((current) => (current === folderId ? null : folderId));
  }, []);

  return {
    expandedFolderId,
    folderNotebooks,
    loadingFolderNotebooks,
    toggleFolderExpansion,
  };
}
