import type { MindMapNote } from "@/shared/types/index";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

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

function normalizeMindMapNodeData(rawData: any, fallbackTitle: string) {
  const maybeWrapped = rawData?.nodeData?.nodeData ?? rawData?.nodeData ?? rawData;
  const normalized = maybeWrapped && typeof maybeWrapped === "object" ? { ...maybeWrapped } : {};

  if (typeof normalized.topic !== "string" || normalized.topic.trim().length === 0) {
    normalized.topic = fallbackTitle || "Mind Map";
  }
  if (typeof normalized.id !== "string" || normalized.id.trim().length === 0) {
    normalized.id = "root";
  }

  return { nodeData: normalized };
}

/**
 * Map a database mindmap response to the frontend MindMapNote interface
 */
function mapMindMapToNote(dbMindMap: any): MindMapNote {
  let preview: string;

  // Determine preview based on status
  if (
    dbMindMap.status === "generating" ||
    dbMindMap.status === "mapping" ||
    dbMindMap.status === "collapsing" ||
    dbMindMap.status === "reducing"
  ) {
    preview = "Mind Map • Generating...";
  } else if (dbMindMap.status === "completed") {
    preview = "Mind Map • Visual Overview";
  } else if (dbMindMap.status === "failed") {
    preview = "Mind Map • Failed";
  } else {
    preview = "Mind Map • Visual Overview";
  }

  // Parse data if it's a string
  let rawMindMapData = dbMindMap.data;
  if (typeof dbMindMap.data === "string") {
    try {
      rawMindMapData = JSON.parse(dbMindMap.data);
    } catch {
      rawMindMapData = null;
    }
  }
  const mindMapData = normalizeMindMapNodeData(rawMindMapData, dbMindMap.title);

  return {
    id: dbMindMap._id,
    title: dbMindMap.title,
    preview,
    type: "mindmap" as const,
    content:
      typeof dbMindMap.data === "string" ? dbMindMap.data : JSON.stringify(dbMindMap.data, null, 2),
    status: dbMindMap.status as MindMapNote["status"],
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
    api.studio.mindmaps.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return mindMaps?.map(mapMindMapToNote);
}

/**
 * Get a specific mind map by ID
 */
export function useMindMap(mindMapId: string | null) {
  const mindMap = useQuery(
    api.studio.mindmaps.index.get,
    mindMapId ? { id: mindMapId as Id<"mindmaps"> } : "skip"
  );
  return mindMap ? mapMindMapToNote(mindMap) : null;
}

/**
 * Create a new mind map and queue generation
 */
export function useCreateMindMap() {
  const generate = useMutation(api.studio.mindmaps.index.generateMindMap);

  return async (params: CreateMindMapParams): Promise<CreateMindMapResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      title: params.title,
    });

    return {
      mindMapId: result,
      status: "pending",
      mindmap: mapMindMapToNote({
        _id: result,
        status: "pending",
        title: params.title || "Mind Map",
      }),
    };
  };
}

/**
 * Rename a mind map by ID with optimistic update
 */
export function useRenameMindMap() {
  const update = useMutation(api.studio.mindmaps.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title } = args;

      // Read the current mind map to get its notebookId
      const mindMap = localStore.getQuery(api.studio.mindmaps.index.get, { id });
      if (mindMap) {
        // Update detail view
        localStore.setQuery(api.studio.mindmaps.index.get, { id }, { ...mindMap, title });

        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.mindmaps.index.list, {
          notebookId: mindMap.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.mindmaps.index.list,
            { notebookId: mindMap.notebookId },
            listResult.map((mm: { _id: string; [key: string]: unknown }) =>
              mm._id === id ? { ...mm, title } : mm
            )
          );
        }
      }
    }
  );

  return async (mindMapId: string, newTitle: string) => {
    return await update({
      id: mindMapId as Id<"mindmaps">,
      title: newTitle,
    });
  };
}

/**
 * Delete a mind map by ID with optimistic update
 */
export function useDeleteMindMap() {
  const remove = useMutation(api.studio.mindmaps.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Read the current mind map to get its notebookId
      const mindMap = localStore.getQuery(api.studio.mindmaps.index.get, { id: args.id });
      if (mindMap) {
        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.mindmaps.index.list, {
          notebookId: mindMap.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.mindmaps.index.list,
            { notebookId: mindMap.notebookId },
            listResult.filter((mm: { _id: string }) => mm._id !== args.id)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(api.studio.mindmaps.index.get, { id: args.id }, null);
    }
  );

  return async (mindMapId: string) => {
    await remove({ id: mindMapId as Id<"mindmaps"> });
  };
}
