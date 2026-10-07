import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { removeFromNotesCache, renameInNotesCache, useOptimisticMutation } from "./notesCache";

export interface CreateInfographicParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  customPrompt?: string;
  orientation?: "landscape" | "portrait" | "square";
  visualStyle?: string;
  detailLevel?: "concise" | "standard" | "detailed";
}

/**
 * Create a new infographic and queue generation
 */
export function useCreateInfographic() {
  const generate = useMutation(api.studio.infographic.index.generateInfographic);

  return useCallback(
    async (params: CreateInfographicParams) => {
      const id = await generate({
        notebookId: params.notebookId as Id<"notebooks">,
        documentIds: params.documentIds as Id<"documents">[],
        title: params.title,
        customPrompt: params.customPrompt,
        orientation: params.orientation,
        visualStyle: params.visualStyle,
        detailLevel: params.detailLevel,
      });
      return { id, status: "generating" };
    },
    [generate]
  );
}

/**
 * Rename an infographic by ID with optimistic update
 */
export function useRenameInfographic() {
  const update = useOptimisticMutation(api.studio.infographic.index.update, renameInNotesCache);

  return useCallback(
    async (infographicId: string, newTitle: string) => {
      await update({ id: infographicId as Id<"infographics">, title: newTitle });
    },
    [update]
  );
}

/**
 * Delete an infographic by ID with optimistic update
 */
export function useDeleteInfographic() {
  const remove = useOptimisticMutation(api.studio.infographic.index.remove, removeFromNotesCache);

  return useCallback(
    async (infographicId: string) => {
      await remove({ id: infographicId as Id<"infographics"> });
    },
    [remove]
  );
}
