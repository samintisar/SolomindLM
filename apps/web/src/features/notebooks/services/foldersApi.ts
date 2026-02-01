import type { FolderItem } from "@/shared/types/index";
import type { NotebookItem } from "@/shared/types/index";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Get all folders for the authenticated user
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFolders() {
  return useQuery(api.folders.list);
}

/**
 * Get a specific folder by ID
 */
export function useFolder(id: string | null) {
  return useQuery(
    api.folders.get,
    id ? { id: id as any } : "skip"
  );
}

/**
 * Get notebooks in a folder
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useFolderNotebooks(folderId: string | null) {
  return useQuery(
    api.folders.getNotebooks,
    folderId ? { folderId: folderId as any } : "skip"
  );
}

/**
 * Create a new folder with optimistic update
 */
export function useCreateFolder() {
  const create = useMutation(api.folders.create).withOptimisticUpdate((localStore, args) => {
    const tempId = `temp-${Date.now()}` as Id<"folders">;
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
    const folders = localStore.getQuery(api.folders.list);
    if (folders) {
      localStore.setQuery(api.folders.list, {}, [...folders, newFolder]);
    }
  });

  return async (data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }) => {
    return await create(data);
  };
}

/**
 * Update a folder with optimistic update
 */
export function useUpdateFolder() {
  const update = useMutation(api.folders.update).withOptimisticUpdate((localStore, args) => {
    const { id, name, description, color, icon } = args;
    const now = Date.now();

    // Update list view
    const folders = localStore.getQuery(api.folders.list);
    if (folders) {
      localStore.setQuery(
        api.folders.list,
        {},
        folders.map(folder =>
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
    const folder = localStore.getQuery(api.folders.get, { id });
    if (folder) {
      localStore.setQuery(
        api.folders.get,
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
    return await update({ id: id as any, ...updates });
  };
}

/**
 * Delete a folder with optimistic update
 */
export function useDeleteFolder() {
  const remove = useMutation(api.folders.remove).withOptimisticUpdate((localStore, args) => {
    // Optimistically remove from list
    const folders = localStore.getQuery(api.folders.list);
    if (folders) {
      localStore.setQuery(
        api.folders.list,
        {},
        folders.filter(folder => folder.id !== args.id)
      );
    }

    // Clear detail view
    localStore.setQuery(api.folders.get, { id: args.id }, null);
  });

  return async (id: string) => {
    return await remove({ id: id as any });
  };
}
