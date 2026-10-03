import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { RERANK_MODEL, RERANK_TIMEOUT_MS } from "../../_lib/rerankConfig";

export interface VoyageRerankHit {
  /** Position of the document in the `documents` array passed in. */
  index: number;
  relevance_score: number;
}

/** Longest `Retry-After` worth waiting out; anything longer fails straight away. */
const MAX_RETRY_AFTER_MS = 2000;
/** Pause before the retry when a 429 carries no usable `Retry-After`. */
const DEFAULT_RETRY_DELAY_MS = 500;

/** Delay for the 429 retry, or null when `Retry-After` asks for longer than we will wait. */
function retryDelayMs(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_DELAY_MS;
  const ms = seconds * 1000;
  return ms <= MAX_RETRY_AFTER_MS ? ms : null;
}

/**
 * The one implementation of "call Voyage's rerank endpoint." Returns the top `topK`
 * documents ordered by relevance. Reranking only refines retrieval order, so callers fall
 * back to the un-reranked order on any failure rather than stalling the reply: one
 * `RERANK_TIMEOUT_MS` deadline covers the whole call, and the only retry is a single one
 * after a 429 whose `Retry-After` is short (never waiting out a long one, which is what
 * hung chat during the previous provider's outage).
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

  const signal = AbortSignal.timeout(RERANK_TIMEOUT_MS);
  const request: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: RERANK_MODEL, query, documents, top_k: topK }),
    signal,
  };

  let response = await fetch("https://api.voyageai.com/v1/rerank", request);

  if (response.status === 429) {
    const delay = retryDelayMs(response);
    if (delay !== null) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delay));
      response = await fetch("https://api.voyageai.com/v1/rerank", request);
    }
  }

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
