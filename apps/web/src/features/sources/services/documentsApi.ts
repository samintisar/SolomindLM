import type { Document, UploadResponse, DiscoveryRequest, DiscoveryResponse } from '@/shared/types/index';
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from '@/shared/utils/api';

export const documentsApi = {
  /**
   * Upload a file to the ingestion pipeline
   */
  async uploadFile(
    userId: string,
    noteId: string,
    file: File
  ): Promise<UploadResponse> {
    if (!userId || !noteId) {
      throw new Error('userId and noteId are required');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    formData.append('noteId', noteId);
    formData.append('type', 'file');

    const response = await apiUpload('/api/documents/upload', formData);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    return result;
  },

  /**
   * Upload a URL (website or YouTube) to the ingestion pipeline
   */
  async uploadUrl(
    userId: string,
    noteId: string,
    url: string,
    type: 'url' | 'youtube'
  ): Promise<UploadResponse> {
    if (!userId || !noteId) {
      throw new Error('userId and noteId are required');
    }

    const response = await apiPost('/api/documents/upload', {
      userId,
      noteId,
      type,
      source: url,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },

  /**
   * Upload text content to the ingestion pipeline
   */
  async uploadText(
    userId: string,
    noteId: string,
    text: string
  ): Promise<UploadResponse> {
    if (!userId || !noteId) {
      throw new Error('userId and noteId are required');
    }

    const response = await apiPost('/api/documents/upload', {
      userId,
      noteId,
      type: 'text',
      source: text,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },

  /**
   * Get a specific document by ID
   */
  async getDocument(id: string): Promise<Document> {
    const response = await apiGet(`/api/documents/${id}`);

    if (!response.ok) {
      throw new Error('Failed to fetch document');
    }

    return response.json();
  },

  /**
   * Get all documents for a user, optionally filtered by note ID
   */
  async getDocuments(userId: string, noteId?: string): Promise<Document[]> {
    const params = new URLSearchParams({ userId });
    if (noteId) {
      params.append('noteId', noteId);
    }

    const response = await apiGet(`/api/documents?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Failed to fetch documents');
    }

    const docs = await response.json();
    return docs;
  },

  /**
   * Delete a document by ID
   */
  async deleteDocument(id: string): Promise<void> {
    await apiDelete(`/api/documents/${id}`);
  },

  /**
   * Rename a document by ID
   */
  async renameDocument(id: string, newTitle: string): Promise<Document> {
    const response = await apiPatch(`/api/documents/${id}`, { title: newTitle });

    if (!response.ok) {
      throw new Error('Failed to rename document');
    }

    return response.json();
  },

  /**
   * Get the full content of a document (reconstructed from chunks)
   */
  async getDocumentContent(documentId: string): Promise<string> {
    const response = await apiGet(`/api/documents/${documentId}/content`);

    if (!response.ok) {
      throw new Error('Failed to fetch document content');
    }

    const data = await response.json();
    return data.content;
  },

  /**
   * Poll document status until it's completed or failed
   */
  async pollDocumentStatus(
    documentId: string,
    onUpdate?: (status: Document['status']) => void,
    maxAttempts = 60,
    interval = 2000
  ): Promise<Document> {
    for (let i = 0; i < maxAttempts; i++) {
      const doc = await this.getDocument(documentId);

      if (doc.status === 'completed' || doc.status === 'failed') {
        return doc;
      }

      onUpdate?.(doc.status);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Document processing timed out');
  },

  /**
   * Discover web sources using Tavily Search API
   */
  async discoverSources(request: DiscoveryRequest): Promise<DiscoveryResponse> {
    const response = await apiPost('/api/sources/discover', request);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Source discovery failed');
    }

    return response.json();
  },
};
