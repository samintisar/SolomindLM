import type { Id } from "@convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Get all folders for the authenticated user
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFolders() {
  return useQuery(api.folders.index.list);
}

/**
 * Get a specific folder by ID
 */
export function useFolder(id: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useQuery(api.folders.index.get, id ? { id: id as any } : "skip");
}

/**
 * Get notebooks in a folder
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFolderNotebooks(folderId: string | null) {
  return useQuery(
    api.folders.index.getNotebooks,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    folderId ? { folderId: folderId as any } : "skip"
  );
}

/**
 * Create a new folder with optimistic update
 */
export function useCreateFolder() {
  const create = useMutation(api.folders.index.create).withOptimisticUpdate((localStore, args) => {
    // eslint-disable-next-line react-hooks/purity
    const tempId = `temp-${Date.now()}` as Id<"folders">;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();

    const newFolder = {
      id: tempId,
      name: args.name,
      description: args.description,
      color: args.color,
      icon: args.icon,
      created_at: now,
      updated_at: now,
      notebookCount: 0,
    };

    // Optimistically add to list
    const folders = localStore.getQuery(api.folders.index.list);
    if (folders) {
      localStore.setQuery(api.folders.index.list, {}, [...folders, newFolder]);
    }
  });

  return async (data: { name: string; description?: string; color?: string; icon?: string }) => {
    return await create(data);
  };
}

/**
 * Update a folder with optimistic update
 */
export function useUpdateFolder() {
  const update = useMutation(api.folders.index.update).withOptimisticUpdate((localStore, args) => {
    const { id, name, description, color, icon } = args;
    // eslint-disable-next-line react-hooks/purity
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
  });

  return async (
    id: string,
    updates: {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
    }
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await update({ id: id as any, ...updates });
  };
}

/**
 * Delete a folder with optimistic update
 */
export function useDeleteFolder() {
  const remove = useMutation(api.folders.index.remove).withOptimisticUpdate((localStore, args) => {
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
  });

  return async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await remove({ id: id as any });
  };
}
