import { useState, useEffect, useCallback, useRef } from "react";
import { Source } from "@/shared/types/index";
import { documentToSource } from "@/shared/utils/documentToSource";
import {
  useUpdateDocument,
  useDeleteDocument,
  useRemoveManyDocuments,
} from "../services/documentsApi";
import { useToast } from "@/shared/contexts/useToast";
import { type Doc } from "@convex/_generated/dataModel";

interface UseSourceManagerProps {
  documents: Doc<"documents">[];
  notebookId: string | null;
}

export function useSourceManager({ documents, notebookId }: UseSourceManagerProps) {
  const [sources, setSources] = useState<Source[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevDocumentsRef = useRef<any[]>([]);
  const updateDocument = useUpdateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const removeManyDocuments = useRemoveManyDocuments(notebookId);
  const { error: showError } = useToast();

  useEffect(() => {
    const currentSignature = documents
      .map(
        (d: Doc<"documents">) =>
          `${d._id}:${d.status}:${d.fileName}:${d.fileType}:${d.googleDriveFileId ?? ""}:${d.ingestionStatus ?? ""}:${d.fulltextStatus ?? ""}:${(d as Record<string, unknown>).sourceGuide ? "1" : "0"}`
      )
      .join(",");
    const prevSignature = prevDocumentsRef.current
      .map(
        (d: Doc<"documents">) =>
          `${d._id}:${d.status}:${d.fileName}:${d.fileType}:${d.googleDriveFileId ?? ""}:${d.ingestionStatus ?? ""}:${d.fulltextStatus ?? ""}:${(d as Record<string, unknown>).sourceGuide ? "1" : "0"}`
      )
      .join(",");

    if (currentSignature !== prevSignature) {
      setSources((prev) => {
        const newSources = documents.map(documentToSource);
        return newSources.map((source: Source) => ({
          ...source,
          selected: prev.find((s) => s.id === source.id)?.selected ?? true,
        }));
      });
      prevDocumentsRef.current = documents;
    }
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
      try {
        setSources((prev) => prev.filter((s) => s.id !== sourceId));
        await deleteDocumentMutation(sourceId);
      } catch (error) {
        console.error("Failed to delete source:", error);
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
      try {
        setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, title: newTitle } : s)));
        await updateDocument(sourceId, { title: newTitle });
      } catch (error) {
        console.error("Failed to rename source:", error);
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
