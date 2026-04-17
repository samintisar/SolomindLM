"use node";
import { OpenAIEmbeddings } from "@langchain/openai";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBEDDING_DIMENSIONS = 1536;
const OPENAI_BATCH_SIZE = 512;

/**
 * Client-side embedding service for chat/vector search.
 * Used when running in Convex HTTP actions or other Node contexts.
 */
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

  async embedText(text: string): Promise<number[]> {
    const result = await this.embeddings.embedQuery(text);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return await this.embeddings.embedDocuments(texts);
  }
}
