"use node";

import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { E5_EMBEDDING_MODEL, formatE5Input, type E5InputType } from "../../_lib/e5Embedding";

/**
 * Together E5 embeddings for chat / vector search (same model as document indexing).
 * Pass `inputType: "passage"` for non-query text (e.g. semantic comparison of two passages).
 */
export class EmbeddingService {
  private readonly apiKey: string;
  private readonly batchSize = 100;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Search / HyDE / user query text (E5 `query:` prefix). */
  async embedText(text: string, inputType: E5InputType = "query"): Promise<number[]> {
    const trimmed = text.trim();
    return await invokeWithHttpRetry(async () => {
      const response = await fetch("https://api.together.xyz/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: E5_EMBEDDING_MODEL,
          input: formatE5Input(inputType, trimmed),
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw createExternalServiceErrorFromResponse(
          "together-ai",
          response.status,
          "/v1/embeddings",
          errBody.slice(0, 400)
        );
      }

      const data = await response.json();
      return data.data[0].embedding as number[];
    }, "together_ai_embedding_chat");
  }

  /** Document chunks / corpus text (E5 `passage:` prefix). */
  async embedBatch(texts: string[], inputType: E5InputType = "passage"): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches to avoid timeouts and stay within rate limits
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts
        .slice(i, i + this.batchSize)
        .map((t) => formatE5Input(inputType, t.trim()));

      const part = await invokeWithHttpRetry(async () => {
        const response = await fetch("https://api.together.xyz/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: E5_EMBEDDING_MODEL,
            input: batch,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw createExternalServiceErrorFromResponse(
            "together-ai",
            response.status,
            "/v1/embeddings",
            errBody.slice(0, 400)
          );
        }

        return response.json();
      }, "together_ai_embedding_chat_batch");

      const sortedData = part.data.sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index
      );
      embeddings.push(...sortedData.map((item: { embedding: number[] }) => item.embedding));
    }

    return embeddings;
  }
}
