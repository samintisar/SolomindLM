import type { DocumentSummary } from "@convex/documents/listSummary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/shared/contexts/useToast";
import { Source } from "@/shared/types/index";
import { documentToSource } from "@/shared/utils/documentToSource";
import {
  useDeleteDocument,
  useRemoveManyDocuments,
  useUpdateDocument,
} from "../services/documentsApi";

/** Structural equality for JSON-like values (Convex query results). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((k) =>
    sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
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
  const prevInputRef = useRef<{
    documents: readonly DocumentSummary[];
    notebookId: string | null;
  } | null>(null);
  /** Rows added locally whose document is not in `documents` yet. */
  const localIdsRef = useRef(new Set<string>());
  /** Rows removed locally whose delete has not finished yet. */
  const deletingIdsRef = useRef(new Set<string>());
  const updateDocument = useUpdateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const removeManyDocuments = useRemoveManyDocuments(notebookId);
  const { error: showError } = useToast();

  useEffect(() => {
    // Rebuild only when the content changes, not on every new array, so local renames and
    // selection survive. Comparing whole documents covers every field `documentToSource` reads.
    const prevInput = prevInputRef.current;
    const notebookChanged = prevInput?.notebookId !== notebookId;
    if (
      prevInput &&
      !notebookChanged &&
      prevInput.documents.length === documents.length &&
      prevInput.documents.every((d, i) => sameValue(d, documents[i]))
    ) {
      return;
    }
    prevInputRef.current = { documents, notebookId };
    // Switching notebooks drops local-only rows, even when both lists are the same (e.g. empty).
    if (notebookChanged) localIdsRef.current.clear();
    const serverIds = new Set<string>(documents.map((d) => d._id));
    for (const id of serverIds) localIdsRef.current.delete(id);
    const localIds = localIdsRef.current;
    const deletingIds = deletingIdsRef.current;
    setSources((prev) => {
      const selectedById = new Map(prev.map((s) => [s.id, s.selected]));
      const localRows = prev.filter((s) => localIds.has(s.id));
      const serverRows = documents
        .filter((d) => !deletingIds.has(d._id))
        .map((d) => {
          const source = documentToSource(d);
          return { ...source, selected: selectedById.get(source.id) ?? true };
        });
      return [...localRows, ...serverRows];
    });
  }, [documents, notebookId]);

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
    localIdsRef.current.add(source.id);
    setSources((prev) => [source, ...prev]);
  }, []);

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      const index = sourcesRef.current.findIndex((s) => s.id === sourceId);
      const removed = index >= 0 ? sourcesRef.current[index] : undefined;
      deletingIdsRef.current.add(sourceId);
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
      } finally {
        // A Convex mutation resolves after its result reaches the client's queries.
        deletingIdsRef.current.delete(sourceId);
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

  return useMemo(
    () => ({
      sources,
      handleToggleSource,
      handleToggleAll,
      handleAddSource,
      handleDeleteSource,
      handleDeleteSelectedSources,
      handleRenameSource,
    }),
    [
      sources,
      handleToggleSource,
      handleToggleAll,
      handleAddSource,
      handleDeleteSource,
      handleDeleteSelectedSources,
      handleRenameSource,
    ]
  );
}
