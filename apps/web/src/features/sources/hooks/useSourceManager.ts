import { useState, useEffect, useCallback, useRef } from 'react';
import { Source } from '@/shared/types/index';
import { documentToSource } from '@/shared/utils/documentToSource';
import { useUpdateDocument, useDeleteDocument } from '../services/documentsApi';
import { type Doc } from '@convex/_generated/dataModel';

interface UseSourceManagerProps {
  documents: Doc<'documents'>[];
}

export function useSourceManager({ documents }: UseSourceManagerProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const prevDocumentsRef = useRef<any[]>([]);
  const updateDocument = useUpdateDocument();
  const deleteDocumentMutation = useDeleteDocument();

  useEffect(() => {
    const currentSignature = documents.map((d: Doc<'documents'>) => `${d._id}:${d.status}:${d.fileName}`).join(',');
    const prevSignature = prevDocumentsRef.current.map((d: Doc<'documents'>) => `${d._id}:${d.status}:${d.fileName}`).join(',');

    if (currentSignature !== prevSignature) {
      setSources(prev => {
        const newSources = documents.map(documentToSource);
        return newSources.map((source: Source) => ({
          ...source,
          selected: prev.find(s => s.id === source.id)?.selected ?? true,
        }));
      });
      prevDocumentsRef.current = documents;
    }
  }, [documents]);

  const handleToggleSource = useCallback((id: string) => {
    setSources(prev => prev.map(source =>
      source.id === id ? { ...source, selected: !source.selected } : source
    ));
  }, []);

  const handleToggleAll = useCallback(() => {
    setSources(prev => {
      const allSelected = prev.every(s => s.selected);
      return prev.map(source => ({ ...source, selected: !allSelected }));
    });
  }, []);

  const handleAddSource = useCallback((source: Source) => {
    setSources(prev => [source, ...prev]);
  }, []);

  const handleDeleteSource = useCallback(async (sourceId: string) => {
    try {
      setSources(prev => prev.filter(s => s.id !== sourceId));
      await deleteDocumentMutation(sourceId);
    } catch (error) {
      console.error('Failed to delete source:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete source');
    }
  }, [deleteDocumentMutation]);

  const handleRenameSource = useCallback(async (sourceId: string, newTitle: string) => {
    try {
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, title: newTitle } : s));
      await updateDocument(sourceId, { title: newTitle });
    } catch (error) {
      console.error('Failed to rename source:', error);
      alert(error instanceof Error ? error.message : 'Failed to rename source');
    }
  }, [updateDocument]);

  return {
    sources,
    handleToggleSource,
    handleToggleAll,
    handleAddSource,
    handleDeleteSource,
    handleRenameSource,
  };
}
