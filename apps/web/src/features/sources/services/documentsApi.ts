import type { Document, UploadResponse } from '@/shared/types/index';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Get auth headers with access token
function getAuthHeaders(): HeadersInit {
  const storedUser = localStorage.getItem('solomind_user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.accessToken}`,
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

export const documentsApi = {
  /**
   * Upload a file to the ingestion pipeline
   */
  async uploadFile(
    userId: string,
    noteId: string,
    file: File
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    formData.append('noteId', noteId);
    formData.append('type', 'file');

    const storedUser = localStorage.getItem('solomind_user');
    const accessToken = storedUser ? JSON.parse(storedUser).accessToken : null;

    const headers: HeadersInit = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
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
    const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        noteId,
        type,
        source: url,
      }),
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
    const response = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
      headers: getAuthHeaders(),
    });

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

    const response = await fetch(
      `${API_BASE_URL}/api/documents?${params.toString()}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch documents');
    }

    return response.json();
  },

  /**
   * Delete a document by ID
   */
  async deleteDocument(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete document');
    }
  },

  /**
   * Rename a document by ID
   */
  async renameDocument(id: string, newTitle: string): Promise<Document> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title: newTitle }),
    });

    if (!response.ok) {
      throw new Error('Failed to rename document');
    }

    return response.json();
  },

  /**
   * Get the full content of a document (reconstructed from chunks)
   */
  async getDocumentContent(documentId: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/content`, {
      headers: getAuthHeaders(),
    });

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
};
