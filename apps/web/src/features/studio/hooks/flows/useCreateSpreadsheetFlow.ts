import { useCallback } from 'react';
import type { Note, SpreadsheetNote } from '@/shared/types/index';
import { useCreateSpreadsheet, pollSpreadsheetStatus, getSpreadsheetTypeLabel } from '../../services/spreadsheetsApi';
import type { SpreadsheetConfig } from '../../components/CustomizeSpreadsheetsModal';
import type { CreateFlowContext } from './types';

export function useCreateSpreadsheetFlow(ctx: CreateFlowContext) {
  const createSpreadsheet = useCreateSpreadsheet();

  return useCallback(
    async (config: SpreadsheetConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate a spreadsheet', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const typeLabel = getSpreadsheetTypeLabel(config.spreadsheetType);

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: 'Spreadsheet',
        preview: `Spreadsheet • ${typeLabel} • Generating...`,
        type: 'spreadsheet',
        content: '',
        status: 'generating',
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
          title: 'Spreadsheet',
          spreadsheetType: config.spreadsheetType,
          customPrompt: config.customPrompt,
        });

        const initialNote: SpreadsheetNote = {
          ...spreadsheet,
          id: spreadsheetId,
          status: (spreadsheet.status ?? 'generating') as SpreadsheetNote['status'],
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        pollSpreadsheetStatus(
          () => ctx.notes.find((n) => n.id === spreadsheetId) as SpreadsheetNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(spreadsheetId, updatedNote);
          },
          180,
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(spreadsheetId, finalNote);
          })
          .catch((error) => {
            console.error('Spreadsheet generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === spreadsheetId) || newNote;
              if (failedNote.type === 'spreadsheet') {
                ctx.onUpdateNoteFull(spreadsheetId, {
                  ...failedNote,
                  status: 'failed',
                  preview: `Spreadsheet • ${typeLabel} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate spreadsheet' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create spreadsheet:', error);
        alert(error instanceof Error ? error.message : 'Failed to create spreadsheet');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}
