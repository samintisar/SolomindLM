import { CohereEmbeddings } from '@langchain/cohere';
import { env } from '../../config/env';

export class EmbeddingService {
  private embeddings: CohereEmbeddings;

  constructor(apiKey: string) {
    this.embeddings = new CohereEmbeddings({
      apiKey,
      model: env.COHERE_EMBEDDING_MODEL,
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
