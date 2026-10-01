import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { DEFAULT_COVER_COLOR } from "@/shared/notebook/coverColor";
import type { ChatSettings } from "@/shared/types";
import { DEFAULT_NOTEBOOK_ICON } from "../notebookIcons";

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
        coverColor: args.coverColor || DEFAULT_COVER_COLOR,
        icon: args.icon || DEFAULT_NOTEBOOK_ICON,
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

// ============================================================
// Sharing Hooks
// ============================================================

export function useShareLinks(notebookId: string) {
  return useQuery(api.notebooks.sharing.listShareLinks, {
    notebookId: notebookId as Id<"notebooks">,
  });
}

export function useCreateShareLink() {
  return useMutation(api.notebooks.sharing.createShareLink);
}

export function useRevokeShareLinkWithOptimisticUpdate(notebookId: string) {
  const shareListArgs = { notebookId: notebookId as Id<"notebooks"> };
  return useMutation(api.notebooks.sharing.revokeShareLink).withOptimisticUpdate(
    (localStore, args: { shareLinkId: string }) => {
      const current = localStore.getQuery(api.notebooks.sharing.listShareLinks, shareListArgs);
      if (current === undefined) return;
      localStore.setQuery(
        api.notebooks.sharing.listShareLinks,
        shareListArgs,
        current.map((entry: { id: string; active: boolean; revokedAt: number | null }) =>
          entry.id === args.shareLinkId ? { ...entry, active: false, revokedAt: Date.now() } : entry
        )
      );
    }
  );
}

export function useForkNotebookFromToken() {
  return useMutation(api.notebooks.sharing.forkNotebookFromToken);
}

export function usePeekShareToken(token: string | null) {
  return useQuery(api.notebooks.sharing.peekShareToken, token ? { token } : "skip");
}
