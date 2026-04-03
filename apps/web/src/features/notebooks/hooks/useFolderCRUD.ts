import { useCallback } from 'react';
import { FolderItem } from '@/shared/types/index';
import { useCreateFolder, useUpdateFolder, useDeleteFolder } from '../services/foldersApi';
import { useUpdateNotebook } from '../services/notebooksApi';

interface UseFolderCRUDProps {
  isAuthenticated: boolean;
  user: any;
  onRequireAuth?: (message: string) => void;
}

function alertError(error: unknown, fallback: string) {
  console.error(fallback, error);
  alert(error instanceof Error ? error.message : fallback);
}

export function useFolderCRUD({ isAuthenticated, user, onRequireAuth }: UseFolderCRUDProps) {
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const updateNotebook = useUpdateNotebook();

  const handleCreateFolder = useCallback(async () => {
    if (!isAuthenticated || !user) {
      onRequireAuth?.('Sign in to create a folder.');
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
  }, [isAuthenticated, user, createFolder, onRequireAuth]);

  const handleUpdateFolder = useCallback(async (id: string, updates: Partial<FolderItem>) => {
    if (!isAuthenticated || !user) {
      onRequireAuth?.('Sign in to update folders.');
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
  }, [isAuthenticated, user, updateFolder, onRequireAuth]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    if (!isAuthenticated || !user) {
      onRequireAuth?.('Sign in to delete folders.');
      return;
    }

    try {
      await deleteFolder(id);
    } catch (error) {
      alertError(error, 'Failed to delete folder');
    }
  }, [isAuthenticated, user, deleteFolder, onRequireAuth]);

  const handleMoveNotebookToFolder = useCallback(async (notebookId: string, folderId: string | null) => {
    if (!isAuthenticated || !user) {
      onRequireAuth?.('Sign in to move notebooks.');
      return;
    }

    try {
      await updateNotebook(notebookId, { folderId });
    } catch (error) {
      alertError(error, 'Failed to move notebook');
    }
  }, [isAuthenticated, user, updateNotebook, onRequireAuth]);

  return {
    handleCreateFolder,
    handleUpdateFolder,
    handleDeleteFolder,
    handleMoveNotebookToFolder,
  };
}
