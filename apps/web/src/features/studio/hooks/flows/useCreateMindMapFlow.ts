import { useCallback } from 'react';
import type { Note, MindMapNote } from '@/shared/types/index';
import { useToast } from '@/shared/contexts/ToastContext';
import { useCreateMindMap } from '../../services/mindMapApi';
import { useStudioGenerationCatch } from '../useStudioGenerationCatch';
import type { CreateFlowContext } from './types';

export function useCreateMindMapFlow(ctx: CreateFlowContext) {
  const createMindMap = useCreateMindMap();
  const catchGenerationError = useStudioGenerationCatch();
  const { error: showErrorToast } = useToast();

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
        showErrorToast('Please sign in again to continue.');
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
      } catch (error) {
        await catchGenerationError(error, {
          placeholderId,
          onDeleteNote: ctx.onDeleteNote,
          toastMessage: "Couldn't start the mind map. Please try again.",
          devLabel: 'Failed to create mind map',
        });
      }
    },
    [ctx, createMindMap, catchGenerationError, showErrorToast]
  );
}
