import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { removeFromNotesCache, renameInNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateMindMapParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  /** Steers which sources are read and how the map is organized. */
  customPrompt?: string;
}

/**
 * Create a new mind map and queue generation
 */
export function useCreateMindMap() {
  const generate = useMutation(api.studio.mindmaps.index.generateMindMap);

  return useCallback(
    async (params: CreateMindMapParams) => {
      const id = await generate({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        title: params.title,
        customPrompt: params.customPrompt,
      });
      return { id, status: "pending" };
    },
    [generate]
  );
}

/**
 * Rename a mind map by ID with optimistic update
 */
export function useRenameMindMap() {
  const update = useOptimisticMutation(api.studio.mindmaps.index.update, renameInNotesCache);

  return useCallback(
    async (mindMapId: string, newTitle: string) => {
      await update({ id: mindMapId as Id<"mindmaps">, title: newTitle });
    },
    [update]
  );
}

/**
 * Delete a mind map by ID with optimistic update
 */
export function useDeleteMindMap() {
  const remove = useOptimisticMutation(api.studio.mindmaps.index.remove, removeFromNotesCache);

  return useCallback(
    async (mindMapId: string) => {
      await remove({ id: mindMapId as Id<"mindmaps"> });
    },
    [remove]
  );
}
