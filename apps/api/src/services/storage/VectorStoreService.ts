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
      note_id: noteId,
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
      note_id: noteId,
      match_threshold: 0.78,
      match_count: limit,
    });

    if (error) {
      console.error('Similarity search error:', error);
      throw new Error(`Failed to search vectors: ${error.message}`);
    }

    return data;
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
