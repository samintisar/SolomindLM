import { useCallback } from 'react';
import type { Note, AudioOverviewNote } from '@/shared/types/index';
import { useCreateAudioOverview } from '../../services/audioApi';
import { pollAudioOverviewStatus } from '../../services/audioApi';
import type { AudioConfig } from '../../components/CustomizeAudioModal';
import type { CreateFlowContext } from './types';

export function useCreateAudioFlow(ctx: CreateFlowContext) {
  const createAudioOverview = useCreateAudioOverview();

  return useCallback(
    async (config: AudioConfig) => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate an audio overview', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const formatTitle = config.formatId.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      const newNote: Note = {
        id: placeholderId,
        title: 'Audio Overview',
        preview: `Audio Overview • ${formatTitle} • ${config.length} • Generating...`,
        type: 'audioOverview',
        audioUrl: '',
        transcript: '',
        status: 'generating',
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
        });

        const initialNote: AudioOverviewNote = {
          ...newNote,
          id: audioOverviewId,
          metadata: { ...newNote.metadata, audioOverviewId },
        } as AudioOverviewNote;

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        // Poll for completion using Convex-based audio overviews query
        pollAudioOverviewStatus(
          () => ctx.notes.find((n) => n.id === audioOverviewId) as AudioOverviewNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(audioOverviewId, updatedNote);
          },
          300,
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(audioOverviewId, finalNote);
          })
          .catch((error) => {
            console.error('Audio overview generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === audioOverviewId) || newNote;
              if (failedNote.type === 'audioOverview') {
                ctx.onUpdateNoteFull(audioOverviewId, {
                  ...failedNote,
                  id: audioOverviewId,
                  status: 'failed',
                  preview: `Audio Overview • ${formatTitle} • Failed`,
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate audio overview' },
                } as AudioOverviewNote);
              }
            }
          });
      } catch (error) {
        console.error('Failed to create audio overview:', error);
        alert(error instanceof Error ? error.message : 'Failed to create audio overview');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx, createAudioOverview]
  );
}
