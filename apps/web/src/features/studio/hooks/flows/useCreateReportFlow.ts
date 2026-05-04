import { useCallback } from "react";
import type { Note } from "@/shared/types/index";
import { useToast } from "@/shared/contexts/useToast";
import { getReportSubtitle } from "@/shared/types/reportTypes";
import { useCreateReport } from "../../services/reportsApi";
import { useStudioGenerationCatch } from "../useStudioGenerationCatch";
import type { CreateFlowContext } from "./types";

export function useCreateReportFlow(ctx: CreateFlowContext) {
  const createReport = useCreateReport();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

  return useCallback(
    async (formatId: string, customPrompt?: string) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm(
            "No Sources Selected",
            "Please select at least one source to generate a report",
            { variant: "warning" }
          );
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        showErrorToast("Please sign in again to continue.");
        return;
      }

      const titles: Record<string, string> = {
        briefing: "Briefing Document",
        study_guide: "Study Guide",
        blog_post: "Blog Post",
        summary: "Summary",
        technical_report: "Technical Report",
        concept_explainer: "Concept Explainer",
        methodology_overview: "Methodology Overview",
        custom: "Custom Report",
      };

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: titles[formatId] || "New Report",
        preview: getReportSubtitle(formatId),
        type: "report",
        content: "",
        status: "generating",
        metadata: { reportType: formatId, documentIds: selectedDocumentIds },
      };

      ctx.onAddNote(newNote);

      try {
        const { note } = await createReport({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          reportType: formatId,
          customPrompt,
        });

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, note);
        }
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the report. Please try again.",
          devLabel: "Failed to create report",
        });
      }
    },
    [ctx, createReport, catchGenerationError, showErrorToast]
  );
}
