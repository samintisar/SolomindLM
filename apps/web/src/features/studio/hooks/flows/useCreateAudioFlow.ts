import { useCallback } from "react";
import type { Note, AudioOverviewNote } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/useToast";
import { useCreateAudioOverview } from "../../services/audioApi";
import type { AudioConfig } from "../../components/CustomizeAudioModal";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

export function useCreateAudioFlow(ctx: CreateFlowContext) {
  const createAudioOverview = useCreateAudioOverview();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (config: AudioConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate an audio overview",
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
      const formatTitle = config.formatId
        .replace("_", " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      const newNote: Note = {
        id: placeholderId,
        title: "Audio Overview",
        preview: `Audio Overview • ${formatTitle} • ${config.length}`,
        type: "audioOverview",
        audioUrl: "",
        transcript: "",
        status: "generating",
        metadata: {
          audioType: config.formatId,
          length: config.length,
          focus: config.focus,
        },
      };

      ctx.onAddNote(newNote);

      try {
        const { audioOverviewId } = await createAudioOverview({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          title: `Audio Overview • ${formatTitle}`,
          audioType: config.formatId,
          length: config.length,
          focus: config.focus,
        });

        const initialNote: AudioOverviewNote = {
          ...newNote,
          id: audioOverviewId,
          metadata: { ...newNote.metadata, audioOverviewId },
        } as AudioOverviewNote;

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the audio overview. Please try again.",
          devLabel: "Failed to create audio overview",
        });
      }
    },
    [ctx, createAudioOverview, catchGenerationError, showErrorToast]
  );
}
