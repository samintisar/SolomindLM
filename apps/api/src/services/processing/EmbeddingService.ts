import { OpenAIEmbeddings } from '@langchain/openai';
import { env } from '../../config/env';

// Hardcoded OpenAI embedding configuration
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_EMBEDDING_DIMENSIONS = 1536;
const OPENAI_BATCH_SIZE = 512;

export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;

  constructor(apiKey: string) {
    this.embeddings = new OpenAIEmbeddings({
      apiKey,
      model: OPENAI_EMBEDDING_MODEL,
      dimensions: OPENAI_EMBEDDING_DIMENSIONS,
      batchSize: OPENAI_BATCH_SIZE,
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
