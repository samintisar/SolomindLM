import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
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
 * Create a new notebook.
 *
 * No optimistic insert: callers await the result before closing the dialog or navigating, and a
 * `temp-` placeholder gets a different React key than the real row, so the grid's exit animation
 * showed both cards at once.
 */
export function useCreateNotebook() {
  const create = useMutation(api.notebooks.index.create);

  return useCallback(
    async (data: {
      title: string;
      coverColor?: string;
      icon?: string;
      isFeatured?: boolean;
      folderId?: string | null;
    }) => {
      // Convert folderId to proper type if provided
      const folderId = data.folderId ? (data.folderId as Id<"folders">) : undefined;
      return await create({ ...data, folderId });
    },
    [create]
  );
}

/**
 * Update a notebook with optimistic update
 */
export function useUpdateNotebook() {
  const updateMutation = useMutation(api.notebooks.index.update);
  const update = useMemo(
    () =>
      updateMutation.withOptimisticUpdate((localStore, args) => {
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
      }),
    [updateMutation]
  );

  return useCallback(
    async (
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
    },
    [update]
  );
}

/**
 * Delete a notebook with optimistic update
 */
export function useDeleteNotebook() {
  const removeMutation = useMutation(api.notebooks.index.remove);
  const remove = useMemo(
    () =>
      removeMutation.withOptimisticUpdate((localStore, args) => {
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
