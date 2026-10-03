import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { RERANK_MODEL, RERANK_TIMEOUT_MS } from "../../_lib/rerankConfig";

export interface VoyageRerankHit {
  /** Position of the document in the `documents` array passed in. */
  index: number;
  relevance_score: number;
}

/**
 * The one implementation of "call Voyage's rerank endpoint." Returns the top `topK`
 * documents ordered by relevance. Deliberately has no retries and a hard timeout:
 * reranking only refines retrieval order, so callers fall back to the un-reranked
 * order on any failure rather than stalling the reply.
 */
export async function callVoyageRerank(
  query: string,
  documents: string[],
  apiKey: string,
  topK: number
): Promise<VoyageRerankHit[]> {
  if (documents.length === 0) {
    return [];
  }

  const response = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: RERANK_MODEL, query, documents, top_k: topK }),
    signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw createExternalServiceErrorFromResponse(
      "voyage",
      response.status,
      "/v1/rerank",
      errBody.slice(0, 400)
    );
  }

  const data = (await response.json()) as { data?: VoyageRerankHit[] };
  if (!Array.isArray(data.data)) {
    throw new Error("voyage rerank returned a malformed response");
  }
  return data.data;
}
