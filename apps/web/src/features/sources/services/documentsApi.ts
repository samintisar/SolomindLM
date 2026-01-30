import type { Document, UploadResponse, DiscoveryRequest, DiscoveryResponse } from '@/shared/types/index';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ConvexClient } from 'convex/browser';

// ============================================================
// Hooks (for use in React components)
// ============================================================

/**
 * Get all documents for a notebook (or all for user if no notebookId)
 * Returns undefined while loading, empty array when loaded but no results
 */
export function useDocuments(notebookId: string | null) {
  return useQuery(
    api.documents.list,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : {}
  );
}

/**
 * Get a specific document by ID
 */
export function useDocument(id: string | null) {
  return useQuery(
    api.documents.get,
    id ? { id: id as Id<'documents'> } : 'skip'
  );
}

/**
 * Generate upload URL for file uploads
 */
export function useGenerateUploadUrl() {
  return useMutation(api.documents.generateUploadUrl);
}

/**
 * Create (upload) a new document
 */
export function useCreateDocument() {
  const upload = useMutation(api.documents.upload);

  return async (data: {
    notebookId: string;
    type: 'file' | 'url' | 'youtube' | 'text';
    source?: string;
    fileName: string;
    fileSize?: number;
    storageId?: string;
  }) => {
    return await upload({
      notebookId: data.notebookId as Id<'notebooks'>,
      type: data.type,
      source: data.source,
      storageId: data.storageId,
      fileName: data.fileName,
      fileSize: data.fileSize,
    });
  };
}

/**
 * Update a document (rename) with optimistic update
 */
export function useUpdateDocument() {
  const update = useMutation(api.documents.update).withOptimisticUpdate((localStore, args) => {
    const { id, title } = args;

    // Update list view
    const listResult = localStore.getQuery(api.documents.list, {});
    if (listResult) {
      localStore.setQuery(
        api.documents.list,
        {},
        listResult.map(doc =>
          doc._id === id
            ? { ...doc, fileName: title }
            : doc
        )
      );
    }

    // Update detail view
    const document = localStore.getQuery(api.documents.get, { id });
    if (document) {
      localStore.setQuery(
        api.documents.get,
        { id },
        { ...document, fileName: title }
      );
    }
  });

  return async (id: string, updates: { title: string }) => {
    return await update({ id: id as Id<'documents'>, title: updates.title });
  };
}

/**
 * Delete a document with optimistic update
 */
export function useDeleteDocument() {
  const remove = useMutation(api.documents.remove).withOptimisticUpdate((localStore, args) => {
    // Optimistically remove from list
    const listResult = localStore.getQuery(api.documents.list, {});
    if (listResult) {
      localStore.setQuery(
        api.documents.list,
        {},
        listResult.filter(doc => doc._id !== args.id)
      );
    }

    // Clear detail view
    localStore.setQuery(api.documents.get, { id: args.id }, null);
  });

  return async (id: string) => {
    return await remove({ id: id as Id<'documents'> });
  };
}

/**
 * Get the full content of a document (reconstructed from chunks)
 */
export function useDocumentContent(documentId: string | null) {
  return useQuery(
    api.documents.getContent,
    documentId ? { id: documentId as Id<'documents'> } : 'skip'
  );
}

/**
 * Discover web sources using Tavily Search API
 */
export function useDiscoverSources() {
  const discover = useAction(api.documents.discoverSources);

  return async (request: DiscoveryRequest): Promise<DiscoveryResponse> => {
    const result = await discover(request);
    return { ...result, count: result.sources.length };
  };
}

/**
 * Poll document status until it's completed or failed
 * Note: With Convex, you can also use useQuery with real-time updates
 * This polling function is kept for compatibility
 */
export async function pollDocumentStatus(
  getDocument: () => Document | null | undefined,
  onUpdate?: (status: Document['status']) => void,
  maxAttempts = 60,
  interval = 2000
): Promise<Document> {
  for (let i = 0; i < maxAttempts; i++) {
    const doc = getDocument();

    if (!doc) {
      throw new Error('Document not found');
    }

    if (doc.status === 'completed' || doc.status === 'failed') {
      return doc;
    }

    onUpdate?.(doc.status);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Document processing timed out');
}

/**
 * Upload a file to Convex storage and create a document record
 * This is a React hook that should be used in components
 */
export function useUploadDocument() {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.upload);

  return async (file: File, notebookId: string) => {
    // 1. Get upload URL from Convex (returns URL string)
    const uploadUrl = await generateUploadUrl();

    // 2. POST file to Convex storage; response body contains storageId
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file to storage');
    }

    const { storageId } = await uploadResponse.json();

    // 3. Create document record
    const result = await createDocument({
      notebookId: notebookId as Id<'notebooks'>,
      type: 'file',
      storageId,
      fileName: file.name,
      fileSize: file.size,
    });

    return { documentId: result.documentId };
  };
}

// ============================================================
// Imperative API (for use in event handlers, outside React)
// ============================================================

// Get or create a singleton Convex client
let convexClient: ConvexClient | null = null;
function getConvexClient(): ConvexClient {
  if (!convexClient) {
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    if (!convexUrl) {
      throw new Error('VITE_CONVEX_URL environment variable is not set');
    }
    convexClient = new ConvexClient(convexUrl);
  }
  return convexClient;
}

/**
 * Discover web sources using Tavily Search API
 * This is an imperative function that can be called outside of React
 */
export async function discoverSources(request: DiscoveryRequest): Promise<DiscoveryResponse> {
  const client = getConvexClient();
  const result = await client.action(api.documents.discoverSources, request);
  return { ...result, count: result.sources.length };
}

/**
 * Upload URL as a document
 * This is an imperative function that can be called outside of React
 */
export async function uploadUrl(
  notebookId: string,
  url: string,
  type: 'url' | 'youtube'
): Promise<UploadResponse> {
  const client = getConvexClient();
  const result = await client.mutation(api.documents.upload, {
    notebookId: notebookId as Id<'notebooks'>,
    type,
    source: url,
    fileName: type === 'youtube' ? 'YouTube Video' : url,
  });
  return {
    documentId: result.documentId,
    message: 'Uploaded successfully',
    status: 'success',
  };
}

/**
 * Get document content by ID (imperative, for use in event handlers / effects)
 */
export async function getDocumentContent(documentId: string): Promise<string> {
  const client = getConvexClient();
  const result = await client.query(api.documents.getContent, {
    id: documentId as Id<'documents'>,
  });
  return result.content;
}

/**
 * Upload pasted text as a document
 * This is an imperative function that can be called outside of React
 */
export async function uploadText(
  notebookId: string,
  text: string
): Promise<UploadResponse> {
  const client = getConvexClient();
  const result = await client.mutation(api.documents.upload, {
    notebookId: notebookId as Id<'notebooks'>,
    type: 'text',
    source: text,
    fileName: 'Pasted text',
  });
  return {
    documentId: result.documentId,
    message: 'Uploaded successfully',
    status: 'success',
  };
}

/**
 * Legacy API object for backward compatibility
 * @deprecated Use individual hooks or functions instead
 */
export const documentsApi = {
  discoverSources,
  uploadUrl,
};
