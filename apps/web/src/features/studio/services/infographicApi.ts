import type { InfographicNote } from "@/shared/types/index";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export interface CreateInfographicParams {
  notebookId: string;
  documentIds: string[];
  title?: string;
  customPrompt?: string;
  orientation?: "landscape" | "portrait" | "square";
  visualStyle?: string;
  detailLevel?: "concise" | "standard" | "detailed";
}

export interface CreateInfographicResponse {
  infographicId: string;
  status: string;
  infographic: InfographicNote;
}

export interface InfographicConfig {
  customPrompt?: string;
}

/**
 * Get preview text based on status and metadata
 */
function getPreviewText(status: string, metadata?: any): string {
  const phase = metadata?.phase || status;

  const isGenerating =
    status === "generating" ||
    phase === "generating" ||
    phase === "mapping" ||
    phase === "reducing" ||
    phase === "generating_image";

  if (isGenerating) {
    return `Infographic • Generating...`;
  }
  if (status === "failed" || phase === "failed") {
    return `Infographic • Failed`;
  }
  return `Infographic`;
}

/**
 * Map a database infographic response to the frontend InfographicNote interface
 */
function mapInfographicToNote(dbInfographic: any): InfographicNote {
  let imageUrl = "";
  let prompt = "";

  if (dbInfographic.data) {
    try {
      const parsedData =
        typeof dbInfographic.data === "string"
          ? JSON.parse(dbInfographic.data)
          : dbInfographic.data;

      imageUrl = parsedData.imageUrl || "";
      prompt = parsedData.prompt || "";
    } catch {
      imageUrl = "";
      prompt = "";
    }
  }

  return {
    id: dbInfographic._id,
    title: dbInfographic.title,
    preview: getPreviewText(dbInfographic.status, dbInfographic.metadata),
    type: "infographic",
    imageUrl,
    prompt,
    status: dbInfographic.status,
    metadata: {
      sourceDocumentIds: dbInfographic.metadata?.sourceDocumentIds || [],
      generatedAt: dbInfographic.metadata?.generatedAt,
      customPrompt: dbInfographic.metadata?.customPrompt,
      error: dbInfographic.metadata?.error,
    },
  };
}

/**
 * Get all infographics for a notebook
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useInfographics(notebookId: string | null) {
  const infographics = useQuery(
    api.studio.infographic.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
  return infographics?.map(mapInfographicToNote);
}

/**
 * Get a specific infographic by ID
 */
export function useInfographic(infographicId: string | null) {
  const infographic = useQuery(
    api.studio.infographic.index.get,
    infographicId ? { id: infographicId as Id<"slides"> } : "skip"
  );
  return infographic ? mapInfographicToNote(infographic) : null;
}

/**
 * Create a new infographic and queue generation
 */
export function useCreateInfographic() {
  const generate = useMutation(api.studio.infographic.index.generateInfographic);

  return async (params: CreateInfographicParams): Promise<CreateInfographicResponse> => {
    const result = await generate({
      notebookId: params.notebookId as Id<"notebooks">,
      documentIds: params.documentIds as Id<"documents">[],
      title: params.title,
      customPrompt: params.customPrompt,
      orientation: params.orientation,
      visualStyle: params.visualStyle,
      detailLevel: params.detailLevel,
    });

    return {
      infographicId: result,
      status: "pending",
      infographic: mapInfographicToNote({
        _id: result,
        status: "pending",
        title: params.title || "Infographic",
      }),
    };
  };
}

/**
 * Rename an infographic by ID with optimistic update
 */
export function useRenameInfographic() {
  const update = useMutation(api.studio.infographic.index.update).withOptimisticUpdate(
    (localStore, args) => {
      const { id, title } = args;

      // Read the current infographic to get its notebookId
      const infographic = localStore.getQuery(api.studio.infographic.index.get, { id });
      if (infographic) {
        // Update detail view
        localStore.setQuery(api.studio.infographic.index.get, { id }, { ...infographic, title });

        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.infographic.index.list, {
          notebookId: infographic.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.infographic.index.list,
            { notebookId: infographic.notebookId },
            listResult.map((item: { _id: string; [key: string]: unknown }) =>
              item._id === id ? { ...item, title } : item
            )
          );
        }
      }
    }
  );

  return async (infographicId: string, newTitle: string) => {
    return await update({
      id: infographicId as Id<"slides">,
      title: newTitle,
    });
  };
}

/**
 * Delete an infographic by ID with optimistic update
 */
export function useDeleteInfographic() {
  const remove = useMutation(api.studio.infographic.index.remove).withOptimisticUpdate(
    (localStore, args) => {
      // Read the current infographic to get its notebookId
      const infographic = localStore.getQuery(api.studio.infographic.index.get, { id: args.id });
      if (infographic) {
        // Update list view using the notebookId from the item
        const listResult = localStore.getQuery(api.studio.infographic.index.list, {
          notebookId: infographic.notebookId,
        });
        if (listResult) {
          localStore.setQuery(
            api.studio.infographic.index.list,
            { notebookId: infographic.notebookId },
            listResult.filter((item: { _id: string }) => item._id !== args.id)
          );
        }
      }

      // Clear detail view
      localStore.setQuery(api.studio.infographic.index.get, { id: args.id }, null);
    }
  );

  return async (infographicId: string) => {
    await remove({ id: infographicId as Id<"slides"> });
  };
}
