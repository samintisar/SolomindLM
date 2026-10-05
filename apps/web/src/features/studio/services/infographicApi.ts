import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import type { InfographicNote } from "@/shared/types/index";
import { patchNoteInNotesCache, removeNoteFromNotesCache } from "./notesCache";

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
    return `Infographic · Generating…`;
  }
  if (status === "failed" || phase === "failed") {
    return `Infographic · Failed`;
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
      status: "generating",
      infographic: mapInfographicToNote({
        _id: result,
        status: "generating",
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
    (localStore, { id, title }) => {
      patchNoteInNotesCache(localStore, id, { title });
    }
  );

  return async (infographicId: string, newTitle: string) => {
    return await update({
      id: infographicId as Id<"infographics">,
      title: newTitle,
    });
  };
}

/**
 * Delete an infographic by ID with optimistic update
 */
export function useDeleteInfographic() {
  const remove = useMutation(api.studio.infographic.index.remove).withOptimisticUpdate(
    (localStore, { id }) => {
      removeNoteFromNotesCache(localStore, id);
    }
  );

  return async (infographicId: string) => {
    await remove({ id: infographicId as Id<"infographics"> });
  };
}
