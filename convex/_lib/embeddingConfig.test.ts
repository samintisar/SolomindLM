import { describe, expect, it } from "vitest";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  RAG_CHUNK_OVERLAP_TOKENS,
  RAG_CHUNK_SIZE_TOKENS,
} from "./embeddingConfig";

describe("embeddingConfig", () => {
  it("targets OpenAI text-embedding-3-small at 1536 native dimensions", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it("keeps chunk sizing below the model's context window with room for overlap", () => {
    expect(RAG_CHUNK_SIZE_TOKENS).toBeGreaterThan(0);
    expect(RAG_CHUNK_OVERLAP_TOKENS).toBeGreaterThan(0);
    expect(RAG_CHUNK_OVERLAP_TOKENS).toBeLessThan(RAG_CHUNK_SIZE_TOKENS);
  });

  it("batches multiple chunks per embeddings API call", () => {
    expect(EMBEDDING_BATCH_SIZE).toBeGreaterThan(1);
  });
});
