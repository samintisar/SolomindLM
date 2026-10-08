import type { DocumentSummary } from "@convex/documents/listSummary";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/contexts/useToast";
import { Source } from "@/shared/types/index";
import { documentToSource } from "@/shared/utils/documentToSource";
import {
  useDeleteDocument,
  useRemoveManyDocuments,
  useUpdateDocument,
} from "../services/documentsApi";

/** Fields that change what a source row shows. Rebuild `sources` only when one of them changes. */
function documentSignature(d: DocumentSummary): string {
  return `${d._id}:${d.status}:${d.fileName}:${d.fileType}:${d.googleDriveFileId ?? ""}:${d.ingestionStatus ?? ""}:${d.fulltextStatus ?? ""}:${d.sourceGuide ? "1" : "0"}:${d.wordCount ?? ""}:${d.totalChunks ?? ""}:${d.metadata?.userMessage ?? ""}`;
}

interface UseSourceManagerProps {
  documents: readonly DocumentSummary[];
  notebookId: string | null;
}

export function useSourceManager({ documents, notebookId }: UseSourceManagerProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const sourcesRef = useRef<Source[]>([]);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);
  const prevSignatureRef = useRef("");
  const updateDocument = useUpdateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const removeManyDocuments = useRemoveManyDocuments(notebookId);
  const { error: showError } = useToast();

  useEffect(() => {
    const signature = documents.map(documentSignature).join(",");
    if (signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;
    setSources((prev) => {
      const newSources = documents.map(documentToSource);
      return newSources.map((source: Source) => ({
        ...source,
        selected: prev.find((s) => s.id === source.id)?.selected ?? true,
      }));
    });
  }, [documents]);

  const handleToggleSource = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((source) => (source.id === id ? { ...source, selected: !source.selected } : source))
    );
  }, []);

  const handleToggleAll = useCallback((visibleIds: string[]) => {
    if (visibleIds.length === 0) return;
    const idSet = new Set(visibleIds);
    setSources((prev) => {
      const visibleInState = prev.filter((s) => idSet.has(s.id));
      if (visibleInState.length === 0) return prev;
      const allVisibleSelected = visibleInState.every((s) => s.selected);
      return prev.map((source) =>
        idSet.has(source.id) ? { ...source, selected: !allVisibleSelected } : source
      );
    });
  }, []);

  const handleAddSource = useCallback((source: Source) => {
    setSources((prev) => [source, ...prev]);
  }, []);

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      const index = sourcesRef.current.findIndex((s) => s.id === sourceId);
      const removed = index >= 0 ? sourcesRef.current[index] : undefined;
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      try {
        await deleteDocumentMutation(sourceId);
      } catch (error) {
        console.error("Failed to delete source:", error);
        if (removed) {
          setSources((prev) => {
            if (prev.some((s) => s.id === sourceId)) return prev;
            const at = Math.min(index, prev.length);
            return [...prev.slice(0, at), removed, ...prev.slice(at)];
          });
        }
        showError(error instanceof Error ? error.message : "Failed to delete source");
      }
    },
    [deleteDocumentMutation, showError]
  );

  const handleDeleteSelectedSources = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await removeManyDocuments(ids);
      } catch (error) {
        console.error("Failed to delete sources:", error);
        showError(error instanceof Error ? error.message : "Failed to delete sources");
      }
    },
    [removeManyDocuments, showError]
  );

  const handleRenameSource = useCallback(
    async (sourceId: string, newTitle: string) => {
      const previousTitle = sourcesRef.current.find((s) => s.id === sourceId)?.title;
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, title: newTitle } : s)));
      try {
        await updateDocument(sourceId, { title: newTitle });
      } catch (error) {
        console.error("Failed to rename source:", error);
        if (previousTitle !== undefined) {
          setSources((prev) =>
            prev.map((s) => (s.id === sourceId ? { ...s, title: previousTitle } : s))
          );
        }
        showError(error instanceof Error ? error.message : "Failed to rename source");
      }
    },
    [updateDocument, showError]
  );

  return {
    sources,
    handleToggleSource,
    handleToggleAll,
    handleAddSource,
    handleDeleteSource,
    handleDeleteSelectedSources,
    handleRenameSource,
  };
}
