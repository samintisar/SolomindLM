import { useDocument } from '../services/documentsApi';

type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface UseDocumentStatusResult {
  status: DocumentStatus;
  isPolling: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDocumentStatus(documentId: string): UseDocumentStatusResult {
  const doc = useDocument(documentId);
  const status = (doc?.status ?? 'pending') as DocumentStatus;

  return {
    status,
    isPolling: false,
    error: null,
    refresh: async () => {},
  };
}
