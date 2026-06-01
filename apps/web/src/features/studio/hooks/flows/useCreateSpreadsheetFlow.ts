import { useCallback } from "react";
import { useToast } from "@/shared/contexts/useToast";
import type { Note, SpreadsheetNote } from "@/shared/types/index";
import type { SpreadsheetConfig } from "../../components/CustomizeSpreadsheetsModal";
import { getSpreadsheetTypeLabel, useCreateSpreadsheet } from "../../services/spreadsheetsApi";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

export function useCreateSpreadsheetFlow(ctx: CreateFlowContext) {
  const createSpreadsheet = useCreateSpreadsheet();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (config: SpreadsheetConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate a spreadsheet",
            { variant: "warning" }
          );
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        showErrorToast("Please sign in again to continue.");
        return;
      }

      const typeLabel = getSpreadsheetTypeLabel(config.spreadsheetType);

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: "Spreadsheet",
        preview: `Spreadsheet • ${typeLabel}`,
        type: "spreadsheet",
        content: "",
        status: "generating",
        metadata: {
          spreadsheetType: config.spreadsheetType,
          documentIds: selectedDocumentIds,
          customPrompt: config.customPrompt,
        },
      };

      ctx.onAddNote(newNote);

      try {
        const { spreadsheetId, spreadsheet } = await createSpreadsheet({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          title: "Spreadsheet",
          spreadsheetType: config.spreadsheetType,
          customPrompt: config.customPrompt,
        });

        const initialNote: SpreadsheetNote = {
          ...spreadsheet,
          id: spreadsheetId,
          status: (spreadsheet.status ?? "generating") as SpreadsheetNote["status"],
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the spreadsheet. Please try again.",
          devLabel: "Failed to create spreadsheet",
        });
      }
    },
    [ctx, createSpreadsheet, catchGenerationError, showErrorToast]
  );
}
