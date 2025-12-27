import { CohereEmbeddings } from '@langchain/cohere';

export class EmbeddingService {
  private embeddings: CohereEmbeddings;

  constructor(apiKey: string) {
    this.embeddings = new CohereEmbeddings({
      apiKey,
      model: 'embed-multilingual-v3.0', // 1024 dimensions
      batchSize: 96, // Cohere handles max 96 texts per call
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      return await this.embeddings.embedDocuments(texts);
    } catch (error) {
      console.error('Embedding service error:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  async embedText(text: string): Promise<number[]> {
    try {
      return await this.embeddings.embedQuery(text);
    } catch (error) {
      console.error('Embedding service error:', error);
      throw new Error('Failed to generate embedding');
    }
  }
}
