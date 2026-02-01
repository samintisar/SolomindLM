import type { Note, MindMapNote } from '@/shared/types/index';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface CreateMindMapParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
}

export interface CreateMindMapResponse {
  mindMapId: string;
  status: string;
  mindmap: MindMapNote;
}

/**
 * Map a database mindmap response to the frontend MindMapNote interface
 */
function mapMindMapToNote(dbMindMap: any): MindMapNote {
  let preview = '';

  // Determine preview based on status
  if (dbMindMap.status === 'generating' || dbMindMap.status === 'mapping' || dbMindMap.status === 'collapsing' || dbMindMap.status === 'reducing') {
    preview = 'Mind Map • Generating...';
  } else if (dbMindMap.status === 'completed') {
    preview = 'Mind Map • Visual Overview';
  } else if (dbMindMap.status === 'failed') {
    preview = 'Mind Map • Failed';
  } else {
    preview = 'Mind Map • Visual Overview';
  }

  // Parse data if it's a string
  let mindMapData = dbMindMap.data;
  if (typeof dbMindMap.data === 'string') {
    try {
      mindMapData = JSON.parse(dbMindMap.data);
    } catch {
      mindMapData = { nodes: [], edges: [] };
    }
  }

  return {
    id: dbMindMap._id,
    title: dbMindMap.title,
    preview,
    type: 'mindmap' as const,
    content: typeof dbMindMap.data === 'string' ? dbMindMap.data : JSON.stringify(dbMindMap.data, null, 2),
    status: dbMindMap.status as MindMapNote['status'],
    metadata: dbMindMap.metadata || {},
    mindMapData,
  };
}

/**
 * Get all mind maps for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useMindMaps(notebookId: string | null) {
  const mindMaps = useQuery(
    api.mindmaps.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
  return mindMaps?.map(mapMindMapToNote);
}

/**
 * Get a specific mind map by ID
 */
export function useMindMap(mindMapId: string | null) {
  const mindMap = useQuery(
    api.mindmaps.get,
    mindMapId ? { id: mindMapId as Id<'mindmaps'> } : 'skip'
  );
  return mindMap ? mapMindMapToNote(mindMap) : null;
}

/**
 * Create a new mind map and queue generation
 */
export function useCreateMindMap() {
  const generate = useMutation(api.mindmaps.generateMindMap);

  return async (params: CreateMindMapParams): Promise<CreateMindMapResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<'notebooks'>,
      documentIds: params.documentIds as Id<'documents'>[],
      title: params.title,
    });

    return {
      mindMapId: result,
      status: 'pending',
      mindmap: mapMindMapToNote({ _id: result, status: 'pending', title: params.title || 'Mind Map' }),
    };
  };
}

/**
 * Rename a mind map by ID with optimistic update
 */
export function useRenameMindMap() {
  const update = useMutation(api.mindmaps.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Read the current mind map to get its notebookId
    const mindMap = localStore.getQuery(api.mindmaps.get, { id });
    if (mindMap) {
      // Update detail view
      localStore.setQuery(
        api.mindmaps.get,
        { id },
        { ...mindMap, title }
      );

      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.mindmaps.list, { notebookId: mindMap.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.mindmaps.list,
          { notebookId: mindMap.notebookId },
          listResult.map(mm =>
            mm._id === id
              ? { ...mm, title }
              : mm
          )
        );
      }
    }
  });

  return async (mindMapId: string, newTitle: string) => {
    return await update({
      id: mindMapId as Id<'mindmaps'>,
      title: newTitle,
    });
  };
}

/**
 * Delete a mind map by ID with optimistic update
 */
export function useDeleteMindMap() {
  const remove = useMutation(api.mindmaps.remove).withOptimisticUpdate((localStore, args) => {
    // Read the current mind map to get its notebookId
    const mindMap = localStore.getQuery(api.mindmaps.get, { id: args.id });
    if (mindMap) {
      // Update list view using the notebookId from the item
      const listResult = localStore.getQuery(api.mindmaps.list, { notebookId: mindMap.notebookId });
      if (listResult) {
        localStore.setQuery(
          api.mindmaps.list,
          { notebookId: mindMap.notebookId },
          listResult.filter(mm => mm._id !== args.id)
        );
      }
    }

    // Clear detail view
    localStore.setQuery(api.mindmaps.get, { id: args.id }, null);
  });

  return async (mindMapId: string) => {
    await remove({ id: mindMapId as Id<'mindmaps'> });
  };
}

/**
 * Poll mind map status until completion.
 * Pass initialNote from the create response so the first poll succeeds before
 * Convex query reactivity has added the new item to the notes list.
 */
export async function pollMindMapStatus(
  getMindMap: () => MindMapNote | null | undefined,
  onUpdate?: (note: MindMapNote) => void,
  maxAttempts = 180, // 6 minutes @ 2s intervals
  interval = 2000,
  initialNote?: MindMapNote
): Promise<MindMapNote> {
  for (let i = 0; i < maxAttempts; i++) {
    const note = getMindMap() ?? initialNote;

    if (!note) {
      throw new Error('Mind map not found');
    }

    if (note.status === 'completed' || note.status === 'failed') {
      return note;
    }

    onUpdate?.(note);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Mind map generation timed out');
}
