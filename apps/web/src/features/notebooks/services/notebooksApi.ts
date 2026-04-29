import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatSettings } from "@/shared/types";

// ============================================================
// Hooks (for use in React components)
// ============================================================

/**
 * Get all notebooks for the authenticated user
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useNotebooks() {
  return useQuery(api.notebooks.index.list);
}

/**
 * Get a specific notebook by ID
 * Returns undefined while loading, null when not found
 */
export function useNotebook(id: string | null) {
  return useQuery(api.notebooks.index.get, id ? { id: id as any } : "skip");
}

/**
 * Create a new notebook with optimistic update
 */
export function useCreateNotebook() {
  const create = useMutation(api.notebooks.index.create).withOptimisticUpdate(
    (localStore, args) => {
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
        isSharedNotebook: false,
        folderId: args.folderId,
        created_at: now,
        updated_at: now,
      };

      // Optimistically add to list
      const notebooks = localStore.getQuery(api.notebooks.index.list);
      if (notebooks) {
        localStore.setQuery(api.notebooks.index.list, {}, [newNotebook, ...notebooks]);
      }
    }
  );

  return async (data: {
    title: string;
    coverColor?: string;
    icon?: string;
    isFeatured?: boolean;
    folderId?: string | null;
  }) => {
    // Convert folderId to proper type if provided
    const folderId = data.folderId ? (data.folderId as Id<"folders">) : undefined;
    return await create({ ...data, folderId });
  };
}

/**
 * Update a notebook with optimistic update
 */
export function useUpdateNotebook() {
  const update = useMutation(api.notebooks.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title, coverColor, icon, isFeatured, folderId, chatSettings } = args;
      const now = Date.now();

      // Update list view
      const notebooks = localStore.getQuery(api.notebooks.index.list);
      if (notebooks) {
        localStore.setQuery(
          api.notebooks.index.list,
          {},
          notebooks.map((nb: { id: string; [key: string]: unknown }) =>
            nb.id === id
              ? {
                  ...nb,
                  ...(title !== undefined && { title }),
                  ...(coverColor !== undefined && { coverColor }),
                  ...(icon !== undefined && { icon }),
                  ...(isFeatured !== undefined && { isFeatured }),
                  ...(folderId !== undefined && { folderId }),
                  ...(chatSettings !== undefined && { chatSettings }),
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
      const notebook = localStore.getQuery(api.notebooks.index.get, { id });
      if (notebook) {
        localStore.setQuery(
          api.notebooks.index.get,
          { id },
          {
            ...notebook,
            ...(title !== undefined && { title }),
            ...(coverColor !== undefined && { coverColor }),
            ...(icon !== undefined && { icon }),
            ...(isFeatured !== undefined && { isFeatured }),
            ...(folderId !== undefined && { folderId }),
            ...(chatSettings !== undefined && { chatSettings }),
            updated_at: now,
            date: new Date(now).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          }
        );
      }
    }
  );

  return async (
    id: string,
    updates: {
      title?: string;
      coverColor?: string;
      icon?: string;
      isFeatured?: boolean;
      folderId?: string | null;
      chatSettings?: ChatSettings;
    }
  ) => {
    // Convert folderId to proper type if provided
    const folderId =
      updates.folderId !== undefined
        ? updates.folderId === null
          ? undefined
          : (updates.folderId as Id<"folders">)
        : undefined;
    return await update({ id: id as any, ...updates, folderId });
  };
}

/**
 * Delete a notebook with optimistic update
 */
export function useDeleteNotebook() {
  const remove = useMutation(api.notebooks.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Optimistically remove from list
      const notebooks = localStore.getQuery(api.notebooks.index.list);
      if (notebooks) {
        localStore.setQuery(
          api.notebooks.index.list,
          {},
          notebooks.filter((nb: { id: string }) => nb.id !== args.id)
        );
      }

      // Clear detail view
      localStore.setQuery(api.notebooks.index.get, { id: args.id }, null);
    }
  );

  return async (id: string) => {
    return await remove({ id: id as any });
  };
}

/**
 * Get reports for a notebook (renamed from useNotebookNotes)
 */
export function useNotebookReports(notebookId: string | null) {
  return useQuery(
    api.notebooks.index.getReports,
    notebookId ? { notebookId: notebookId as any } : "skip"
  );
}
