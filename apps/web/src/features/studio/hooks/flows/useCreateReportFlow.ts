import { useCallback } from 'react';
import type { Note, ReportNote } from '@/shared/types/index';
import { getReportSubtitle } from '@/shared/types/reportTypes';
import { useCreateReport, pollReportStatus } from '../../services/reportsApi';
import type { CreateFlowContext } from './types';

export function useCreateReportFlow(ctx: CreateFlowContext) {
  const createReport = useCreateReport();

  return useCallback(
    async (formatId: string, customPrompt?: string) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate a report', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const titles: Record<string, string> = {
        briefing: 'Briefing Document',
        study_guide: 'Study Guide',
        blog_post: 'Blog Post',
        summary: 'Summary',
        technical_report: 'Technical Report',
        concept_explainer: 'Concept Explainer',
        methodology_overview: 'Methodology Overview',
        custom: 'Custom Report',
      };

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: titles[formatId] || 'New Report',
        preview: getReportSubtitle(formatId),
        type: 'report',
        content: '',
        status: 'generating',
        metadata: { reportType: formatId, documentIds: selectedDocumentIds },
      };

      ctx.onAddNote(newNote);

      try {
        const { reportId, note } = await createReport({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          reportType: formatId,
          customPrompt,
        });

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, note);
        }

        pollReportStatus(
          () => ctx.notes.find((n) => n.id === reportId) as ReportNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(reportId, updatedNote);
          },
          180,
          2000,
          note
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(reportId, finalNote);
          })
          .catch((error) => {
            console.error('Report generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === reportId) || newNote;
              if (failedNote.type === 'report') {
                const reportType = failedNote.metadata.reportType || formatId;
                ctx.onUpdateNoteFull(reportId, {
                  ...failedNote,
                  status: 'failed',
                  preview: `${getReportSubtitle(reportType)} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate report' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create report:', error);
        alert(error instanceof Error ? error.message : 'Failed to create report');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}
