import { useCallback } from 'react';
import type { Note, MindMapNote } from '@/shared/types/index';
import { useCreateMindMap, pollMindMapStatus } from '../../services/mindMapApi';
import type { CreateFlowContext } from './types';

export function useCreateMindMapFlow(ctx: CreateFlowContext) {
  const createMindMap = useCreateMindMap();

  return useCallback(
    async () => {
      const selectedDocumentIds = ctx.sources.filter((s) => s.selected).map((s) => s.id);
      if (selectedDocumentIds.length === 0) {
        if (ctx.confirm) {
          await ctx.confirm('No Sources Selected', 'Please select at least one source to generate a mind map', { variant: 'warning' });
        }
        return;
      }
      if (!ctx.userId || !ctx.noteId) {
        alert('Authentication error. Please log in again.');
        return;
      }

      const placeholderId = Math.random().toString(36).slice(2, 11);
      const newNote: Note = {
        id: placeholderId,
        title: 'Mind Map',
        preview: 'Mind Map • Generating...',
        type: 'mindmap',
        content: '',
        mindMapData: { nodeData: { id: 'root', topic: '', children: [] } },
        status: 'generating',
        metadata: {},
      };

      ctx.onAddNote(newNote);

      try {
        const { mindMapId, mindmap } = await createMindMap({
          notebookId: ctx.noteId,
          documentIds: selectedDocumentIds,
          title: 'Mind Map',
        });

        const initialNote: MindMapNote = {
          id: mindmap.id ?? mindMapId,
          title: mindmap.title,
          preview: 'Mind Map • Generating...',
          type: 'mindmap',
          content: typeof mindmap.content === 'string' ? mindmap.content : '',
          status: (mindmap.status ?? 'generating') as MindMapNote['status'],
          metadata: mindmap.metadata ?? {},
          mindMapData: mindmap.mindMapData ?? { nodeData: { id: 'root', topic: '', children: [] } },
        };

        if (ctx.onUpdateNoteFull) {
          ctx.onUpdateNoteFull(placeholderId, initialNote);
        }

        pollMindMapStatus(
          () => ctx.notes.find((n) => n.id === mindMapId) as MindMapNote | undefined,
          (updatedNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(mindMapId, updatedNote);
          },
          180,
          2000,
          initialNote
        )
          .then((finalNote) => {
            if (ctx.onUpdateNoteFull) ctx.onUpdateNoteFull(mindMapId, finalNote);
          })
          .catch((error) => {
            console.error('Mind map generation failed:', error);
            if (ctx.onUpdateNoteFull) {
              const failedNote = ctx.notes.find((n) => n.id === mindMapId) || newNote;
              if (failedNote.type === 'mindmap') {
                ctx.onUpdateNoteFull(mindMapId, {
                  ...failedNote,
                  status: 'failed',
                  preview: 'Mind Map • Failed',
                  metadata: { ...failedNote.metadata, error: error instanceof Error ? error.message : 'Failed to generate mind map' },
                });
              }
            }
          });
      } catch (error) {
        console.error('Failed to create mind map:', error);
        alert(error instanceof Error ? error.message : 'Failed to create mind map');
        ctx.onDeleteNote(placeholderId);
      }
    },
    [ctx]
  );
}
