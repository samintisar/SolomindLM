import { useCallback } from "react";
import type { Note, InfographicNote } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/useToast";
import { useCreateInfographic } from "../../services/infographicApi";
import type { InfographicConfig } from "../../components/CustomizeInfographicModal";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

export function useCreateInfographicFlow(ctx: CreateFlowContext) {
  const createInfographic = useCreateInfographic();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (config: InfographicConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate an infographic",
            { variant: "warning" }
          );
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        showErrorToast("Please sign in again to continue.");
        return;
      }

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: "Infographic",
        preview: "Infographic • Generating...",
        type: "infographic",
        imageUrl: "",
        status: "generating",
        metadata: {
          sourceDocumentIds: selectedDocumentIds,
          generatedAt: 0,
          customPrompt: config.customPrompt,
          orientation: config.orientation,
          visualStyle: config.visualStyle,
          detailLevel: config.detailLevel,
        },
      };

      ctx.onAddNote(newNote);

      try {
        const { infographicId, infographic } = await createInfographic({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          title: "Infographic",
          customPrompt: config.customPrompt,
          orientation: config.orientation,
          visualStyle: config.visualStyle,
          detailLevel: config.detailLevel,
        });

        const initialNote: InfographicNote = {
          ...infographic,
          id: infographicId,
          status: (infographic.status ?? "generating") as InfographicNote["status"],
          preview: "Infographic • Generating...",
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the infographic. Please try again.",
          devLabel: "Failed to create infographic",
        });
      }
    },
    [ctx, createInfographic, catchGenerationError, showErrorToast]
  );
}
