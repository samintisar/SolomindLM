import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";

/**
 * Get all folders for the authenticated user
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFolders() {
  return useQuery(api.folders.index.list);
}

/**
 * Get notebooks in a folder
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFolderNotebooks(folderId: string | null) {
  return useQuery(
    api.folders.index.getNotebooks,
    folderId ? { folderId: folderId as any } : "skip"
  );
}

/**
 * Create a new folder. No optimistic insert, for the same reason as `useCreateNotebook`.
 */
export function useCreateFolder() {
  const create = useMutation(api.folders.index.create);

  return useCallback(
    async (data: { name: string; description?: string; color?: string; icon?: string }) => {
      return await create(data);
    },
    [create]
  );
}

/**
 * Update a folder with optimistic update
 */
export function useUpdateFolder() {
  const updateMutation = useMutation(api.folders.index.update);
  const update = useMemo(
    () =>
      updateMutation.withOptimisticUpdate((localStore, args) => {
        const { id, name, description, color, icon } = args;
        const now = Date.now();

        // Update list view
        const folders = localStore.getQuery(api.folders.index.list);
        if (folders) {
          localStore.setQuery(
            api.folders.index.list,
            {},
            folders.map((folder: { id: string; [key: string]: unknown }) =>
              folder.id === id
                ? {
                    ...folder,
                    ...(name !== undefined && { name }),
                    ...(description !== undefined && { description }),
                    ...(color !== undefined && { color }),
                    ...(icon !== undefined && { icon }),
                    updated_at: now,
                  }
                : folder
            )
          );
        }

        // Update detail view
        const folder = localStore.getQuery(api.folders.index.get, { id });
        if (folder) {
          localStore.setQuery(
            api.folders.index.get,
            { id },
            {
              ...folder,
              ...(name !== undefined && { name }),
              ...(description !== undefined && { description }),
              ...(color !== undefined && { color }),
              ...(icon !== undefined && { icon }),
              updated_at: now,
            }
          );
        }
      }),
    [updateMutation]
  );

  return useCallback(
    async (
      id: string,
      updates: {
        name?: string;
        description?: string;
        color?: string;
        icon?: string;
      }
    ) => {
      return await update({ id: id as any, ...updates });
    },
    [update]
  );
}

/**
 * Delete a folder with optimistic update
 */
export function useDeleteFolder() {
  const removeMutation = useMutation(api.folders.index.remove);
  const remove = useMemo(
    () =>
      removeMutation.withOptimisticUpdate((localStore, args) => {
        // Optimistically remove from list
        const folders = localStore.getQuery(api.folders.index.list);
        if (folders) {
          localStore.setQuery(
            api.folders.index.list,
            {},
            folders.filter((folder: { id: string }) => folder.id !== args.id)
          );
        }

        // Clear detail view
        localStore.setQuery(api.folders.index.get, { id: args.id }, null);
      }),
    [removeMutation]
  );

  return useCallback(
    async (id: string) => {
      return await remove({ id: id as any });
    },
    [remove]
  );
}
