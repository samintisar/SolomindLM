import { useCallback } from 'react';
import { FolderItem } from '@/shared/types/index';
import { useCreateFolder, useUpdateFolder, useDeleteFolder } from '../services/foldersApi';
import { useUpdateNotebook } from '../services/notebooksApi';

interface UseFolderCRUDProps {
  isAuthenticated: boolean;
  user: any;
}

function alertError(error: unknown, fallback: string) {
  console.error(fallback, error);
  alert(error instanceof Error ? error.message : fallback);
}

export function useFolderCRUD({ isAuthenticated, user }: UseFolderCRUDProps) {
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const updateNotebook = useUpdateNotebook();

  const handleCreateFolder = useCallback(async () => {
    if (!isAuthenticated || !user) {
      console.error('Cannot create folder: not authenticated');
      return;
    }

    try {
      await createFolder({
        name: 'New Folder',
        color: 'bg-blue-500',
        icon: 'Folder',
      });
    } catch (error) {
      alertError(error, 'Failed to create folder');
    }
  }, [isAuthenticated, user, createFolder]);

  const handleUpdateFolder = useCallback(async (id: string, updates: Partial<FolderItem>) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot update folder: not authenticated');
      return;
    }

    try {
      await updateFolder(id, {
        name: updates.name,
        description: updates.description,
        color: updates.color,
        icon: updates.icon,
      });
    } catch (error) {
      alertError(error, 'Failed to update folder');
    }
  }, [isAuthenticated, user, updateFolder]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot delete folder: not authenticated');
      return;
    }

    try {
      await deleteFolder(id);
    } catch (error) {
      alertError(error, 'Failed to delete folder');
    }
  }, [isAuthenticated, user, deleteFolder]);

  const handleMoveNotebookToFolder = useCallback(async (notebookId: string, folderId: string | null) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot move notebook: not authenticated');
      return;
    }

    try {
      await updateNotebook(notebookId, { folderId });
    } catch (error) {
      alertError(error, 'Failed to move notebook');
    }
  }, [isAuthenticated, user, updateNotebook]);

  return {
    handleCreateFolder,
    handleUpdateFolder,
    handleDeleteFolder,
    handleMoveNotebookToFolder,
  };
}
