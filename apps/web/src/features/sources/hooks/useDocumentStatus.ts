import { useState, useEffect, useCallback, useRef } from 'react';
import { documentsApi } from '../services/documentsApi';

type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface UseDocumentStatusResult {
  status: DocumentStatus;
  isPolling: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDocumentStatus(documentId: string): UseDocumentStatusResult {
  const [status, setStatus] = useState<DocumentStatus>('pending');
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    try {
      const doc = await documentsApi.getDocument(documentId);
      setStatus(doc.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    }
  }, [documentId]);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Poll every 2 seconds until completed/failed
    const pollInterval = setInterval(async () => {
      if (!pollingRef.current) return;

      try {
        const doc = await documentsApi.getDocument(documentId);

        setStatus(doc.status);

        // Stop polling if terminal state reached
        if (doc.status === 'completed' || doc.status === 'failed') {
          pollingRef.current = false;
          setIsPolling(false);
          clearInterval(intervalRef.current!);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
        pollingRef.current = false;
        setIsPolling(false);
        clearInterval(intervalRef.current!);
      }
    }, 2000);

    intervalRef.current = pollInterval;
    setIsPolling(true);

    // Cleanup
    return () => {
      pollingRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [documentId]);

  return { status, isPolling, error, refresh };
}
