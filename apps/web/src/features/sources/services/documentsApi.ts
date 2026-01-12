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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:8',message:'uploadFile entry',data:{userId,noteId,fileName:file.name,fileSize:file.size,fileType:file.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!userId || !noteId) {
      throw new Error('userId and noteId are required');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    formData.append('noteId', noteId);
    formData.append('type', 'file');

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:23',message:'Before apiUpload call',data:{url:'/api/documents/upload',formDataKeys:Array.from(formData.keys())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const response = await apiUpload('/api/documents/upload', formData);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:25',message:'After apiUpload response',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!response.ok) {
      // #region agent log
      const errorBody = await response.json().catch(()=>({}));
      fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:27',message:'Upload response not ok',data:{status:response.status,statusText:response.statusText,errorBody},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:32',message:'Upload success',data:{documentId:result.documentId,status:result.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:104',message:'getDocuments request',data:{userId,noteId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    const response = await apiGet(`/api/documents?${params.toString()}`);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:110',message:'getDocuments response',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    if (!response.ok) {
      throw new Error('Failed to fetch documents');
    }

    const docs = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:116',message:'getDocuments parsed',data:{count:Array.isArray(docs)?docs.length:0,statuses:Array.isArray(docs)?docs.map((d:any)=>({id:d.id,status:d.status})):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:142',message:'getDocumentContent entry',data:{documentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    const response = await apiGet(`/api/documents/${documentId}/content`);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:145',message:'getDocumentContent response',data:{documentId,status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (!response.ok) {
      // #region agent log
      const errorBody = await response.json().catch(()=>({}));
      fetch('http://127.0.0.1:7243/ingest/8fe05cda-53a6-4f10-9366-95f9d6180c7f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'documentsApi.ts:147',message:'getDocumentContent error',data:{documentId,status:response.status,errorBody},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
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
