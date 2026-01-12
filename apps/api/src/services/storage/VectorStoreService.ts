import { supabase } from '../../config/database.js';

export interface ChunkWithEmbedding {
  content: string;
  embedding: number[];
  index: number;
}

export class VectorStoreService {
  async storeChunks(
    documentId: string,
    userId: string,
    noteId: string,
    chunks: ChunkWithEmbedding[]
  ): Promise<void> {
    const records = chunks.map((chunk) => ({
      document_id: documentId,
      user_id: userId,
      notebook_id: noteId,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: chunk.embedding,
    }));

    const { error } = await supabase.from('document_chunks').insert(records);

    if (error) {
      console.error('Vector store error:', error);
      throw new Error(`Failed to store chunks: ${error.message}`);
    }
  }

  async similaritySearch(
    userId: string,
    noteId: string,
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<any[]> {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      user_id: userId,
      notebook_id: noteId,
      match_threshold: 0.78,
      match_count: limit,
    });

    if (error) {
      console.error('Similarity search error:', error);
      throw new Error(`Failed to search vectors: ${error.message}`);
    }

    return data;
  }

  /**
   * Hybrid search combining vector similarity with keyword search using RRF
   * @param userId - User ID
   * @param noteId - Note ID
   * @param queryText - Raw query text for keyword search
   * @param queryEmbedding - Query embedding for vector search
   * @param limit - Maximum number of results
   * @param documentIds - Optional document filter
   * @param matchThreshold - Minimum similarity threshold for vector search
   * @returns Array of search results with RRF scores
   */
  async hybridSearch(
    userId: string,
    noteId: string,
    queryText: string,
    queryEmbedding: number[],
    limit: number = 10,
    documentIds?: string[],
    matchThreshold: number = 0.5
  ): Promise<any[]> {
    const { data, error } = await supabase.rpc('match_documents_hybrid', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      user_id: userId,
      notebook_id: noteId,
      match_threshold: matchThreshold,
      match_count: limit,
      document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
      rrf_k: 60, // Standard RRF constant
    });

    if (error) {
      console.error('Hybrid search error:', error);
      throw new Error(`Failed to perform hybrid search: ${error.message}`);
    }

    return data || [];
  }

  async getDocumentChunks(documentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Get document chunks error:', error);
      throw new Error(`Failed to get chunks: ${error.message}`);
    }

    return data;
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    const { error } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (error) {
      console.error('Delete document chunks error:', error);
      throw new Error(`Failed to delete chunks: ${error.message}`);
    }
  }
}
