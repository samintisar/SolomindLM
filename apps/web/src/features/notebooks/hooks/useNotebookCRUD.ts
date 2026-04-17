import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { NotebookItem } from "@/shared/types/index";
import { useCreateNotebook, useUpdateNotebook, useDeleteNotebook } from "../services/notebooksApi";
import { useLimitErrorToast } from "@/shared/hooks/useLimitErrorToast";

interface UseNotebookCRUDProps {
  isAuthenticated: boolean;
  user: any;
  activeNotebookId: string | null;
  setNotebookTitle: (title: string) => void;
  onRequireAuth?: (message: string) => void;
}

function alertError(error: unknown, fallback: string) {
  console.error(fallback, error);
  alert(error instanceof Error ? error.message : fallback);
}

export function useNotebookCRUD({
  isAuthenticated,
  user,
  activeNotebookId,
  setNotebookTitle,
  onRequireAuth,
}: UseNotebookCRUDProps) {
  const navigate = useNavigate();
  const createNotebook = useCreateNotebook();
  const updateNotebook = useUpdateNotebook();
  const deleteNotebook = useDeleteNotebook();
  const { handleLimitError } = useLimitErrorToast();

  const handleCreateNotebook = useCallback(async () => {
    if (!isAuthenticated || !user) {
      onRequireAuth?.("Sign in to create a notebook.");
      return;
    }

    try {
      const newNotebook = await createNotebook({
        title: "Untitled Notebook",
        coverColor: "bg-yellow-500",
        icon: "Folder",
      });
      navigate(`/notebook/${newNotebook.id}`);
    } catch (error) {
      console.error("Failed to create notebook:", error);
      const handled = await handleLimitError(error);
      if (!handled.isLimitError) {
        alertError(error, "Failed to create notebook");
      }
    }
  }, [isAuthenticated, user, createNotebook, navigate, handleLimitError, onRequireAuth]);

  const handleUpdateNotebook = useCallback(
    async (id: string, updates: Partial<NotebookItem>) => {
      if (!isAuthenticated || !user) {
        onRequireAuth?.("Sign in to update notebooks.");
        return;
      }

      try {
        const updatePayload: any = {};
        if (updates.title !== undefined) updatePayload.title = updates.title;
        if (updates.coverColor !== undefined) updatePayload.coverColor = updates.coverColor;
        if (updates.icon !== undefined) updatePayload.icon = updates.icon;
        if (updates.isFeatured !== undefined) updatePayload.isFeatured = updates.isFeatured;

        await updateNotebook(id, updatePayload);

        if (activeNotebookId === id && updates.title) {
          setNotebookTitle(updates.title);
        }
      } catch (error) {
        alertError(error, "Failed to update notebook");
      }
    },
    [isAuthenticated, user, updateNotebook, activeNotebookId, setNotebookTitle, onRequireAuth]
  );

  const handleDeleteNotebook = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !user) {
        onRequireAuth?.("Sign in to delete notebooks.");
        return;
      }

      try {
        await deleteNotebook(id);
        if (activeNotebookId === id) {
          navigate("/");
        }
      } catch (error) {
        alertError(error, "Failed to delete notebook");
      }
    },
    [isAuthenticated, user, deleteNotebook, activeNotebookId, navigate, onRequireAuth]
  );

  return {
    handleCreateNotebook,
    handleUpdateNotebook,
    handleDeleteNotebook,
  };
}
