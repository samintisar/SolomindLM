import { api } from "@convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

export function useSourceGuide(documentId: string | null) {
  const guide = useQuery(
    api.documents.index.getSourceGuide,
    documentId ? { documentId: documentId as any } : "skip"
  );
  const generateGuide = useAction(api.documents.sourceGuide.generateSourceGuide as any);
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (guide?.isGenerating && documentId) {
      // Debounce: only trigger once per document per session
      if (!triggeredRef.current.has(documentId)) {
        triggeredRef.current.add(documentId);
        generateGuide({ documentId: documentId as any });
      }
    }
  }, [guide?.isGenerating, documentId, generateGuide]);

  return {
    summary: guide?.summary ?? null,
    topics: guide?.topics ?? null,
    isLoading: guide?.isGenerating ?? false,
  };
}
