import type { NotebookItem } from "@/shared/types/index";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Doc } from "@convex/_generated/dataModel";

// ============================================================
// Hooks (for use in React components)
// ============================================================

/**
 * Get all notebooks for the authenticated user
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useNotebooks() {
  return useQuery(api.notebooks.list);
}

/**
 * Get a specific notebook by ID
 * Returns undefined while loading, null when not found
 */
export function useNotebook(id: string | null) {
  return useQuery(
    api.notebooks.get,
    id ? { id: id as any } : "skip"
  );
}

/**
 * Create a new notebook with optimistic update
 */
export function useCreateNotebook() {
  const create = useMutation(api.notebooks.create).withOptimisticUpdate((localStore, args) => {
    // Generate a temporary ID for the optimistic update
    const tempId = `temp-${Date.now()}` as Id<"notebooks">;
    const now = Date.now();

    const newNotebook = {
      id: tempId,
      title: args.title,
      date: new Date(now).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      sourceCount: 0,
      coverColor: args.coverColor || "bg-yellow-500",
      icon: args.icon || "Folder",
      isFeatured: args.isFeatured || false,
      folderId: args.folderId,
      created_at: now,
      updated_at: now,
    };

    // Optimistically add to list
    const notebooks = localStore.getQuery(api.notebooks.list);
    if (notebooks) {
      localStore.setQuery(api.notebooks.list, {}, [newNotebook, ...notebooks]);
    }
  });

  return async (data: {
    title: string;
    coverColor?: string;
    icon?: string;
    isFeatured?: boolean;
    folderId?: string | null;
  }) => {
    // Convert folderId to proper type if provided
    const folderId = data.folderId ? data.folderId as Id<"folders"> : undefined;
    return await create({ ...data, folderId });
  };
}

/**
 * Update a notebook with optimistic update
 */
export function useUpdateNotebook() {
  const update = useMutation(api.notebooks.update).withOptimisticUpdate((localStore, args) => {
    const { id, title, coverColor, icon, isFeatured, folderId } = args;
    const now = Date.now();

    // Update list view
    const notebooks = localStore.getQuery(api.notebooks.list);
    if (notebooks) {
      localStore.setQuery(
        api.notebooks.list,
        {},
        notebooks.map(nb =>
          nb.id === id
            ? {
                ...nb,
                ...(title !== undefined && { title }),
                ...(coverColor !== undefined && { coverColor }),
                ...(icon !== undefined && { icon }),
                ...(isFeatured !== undefined && { isFeatured }),
                ...(folderId !== undefined && { folderId }),
                updated_at: now,
                date: new Date(now).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              }
            : nb
        )
      );
    }

    // Update detail view
    const notebook = localStore.getQuery(api.notebooks.get, { id });
    if (notebook) {
      localStore.setQuery(
        api.notebooks.get,
        { id },
        {
          ...notebook,
          ...(title !== undefined && { title }),
          ...(coverColor !== undefined && { coverColor }),
          ...(icon !== undefined && { icon }),
          ...(isFeatured !== undefined && { isFeatured }),
          ...(folderId !== undefined && { folderId }),
          updated_at: now,
          date: new Date(now).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        }
      );
    }
  });

  return async (
    id: string,
    updates: {
      title?: string;
      coverColor?: string;
      icon?: string;
      isFeatured?: boolean;
      folderId?: string | null;
    }
  ) => {
    // Convert folderId to proper type if provided
    const folderId = updates.folderId !== undefined
      ? (updates.folderId === null ? undefined : updates.folderId as Id<"folders">)
      : undefined;
    return await update({ id: id as any, ...updates, folderId });
  };
}

/**
 * Delete a notebook with optimistic update
 */
export function useDeleteNotebook() {
  const remove = useMutation(api.notebooks.remove).withOptimisticUpdate((localStore, args) => {
    // Optimistically remove from list
    const notebooks = localStore.getQuery(api.notebooks.list);
    if (notebooks) {
      localStore.setQuery(
        api.notebooks.list,
        {},
        notebooks.filter(nb => nb.id !== args.id)
      );
    }

    // Clear detail view
    localStore.setQuery(api.notebooks.get, { id: args.id }, null);
  });

  return async (id: string) => {
    return await remove({ id: id as any });
  };
}

/**
 * Get reports for a notebook (renamed from useNotebookNotes)
 */
export function useNotebookReports(notebookId: string | null) {
  return useQuery(
    api.notebooks.getReports,
    notebookId ? { notebookId: notebookId as any } : "skip"
  );
}

// ============================================================
// Imperative API (for use in event handlers, outside React)
// ============================================================

/**
 * Get notebooks for a folder (imperative version)
 * @deprecated Use useFolderNotebooks hook instead
 */
export async function fetchFolderNotebooks(folderId: string): Promise<NotebookItem[]> {
  // This is a placeholder - the actual implementation would use the Convex API
  // For now, return empty array since hooks should be used instead
  console.warn('fetchFolderNotebooks is deprecated. Use useFolderNotebooks hook instead.');
  return [];
}

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks instead
 */
export const notebooksApi = {
  // Hooks
  useNotebooks,
  useNotebook,
  useCreateNotebook,
  useUpdateNotebook,
  useDeleteNotebook,
  useNotebookReports,

  // Imperative functions (deprecated)
  fetchFolderNotebooks,
};
