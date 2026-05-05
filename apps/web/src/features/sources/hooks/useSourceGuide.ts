import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEffect } from "react";

export function useSourceGuide(documentId: string | null) {
  const guide = useQuery(
    api.documents.index.getSourceGuide,
    documentId ? { documentId: documentId as any } : "skip"
  );
  const generateGuide = useAction(api.documents.sourceGuide.generateSourceGuide as any);

  useEffect(() => {
    if (guide?.isGenerating && documentId) {
      generateGuide({ documentId: documentId as any });
    }
  }, [guide?.isGenerating, documentId, generateGuide]);

  return {
    summary: guide?.summary ?? null,
    topics: guide?.topics ?? null,
    isLoading: guide?.isGenerating ?? false,
  };
}
