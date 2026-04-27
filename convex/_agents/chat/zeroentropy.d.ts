/**
 * Type declarations for the zeroentropy package (no bundled types in 0.1.0-alpha).
 * Used for rerank in vector-search.
 */
declare module "zeroentropy" {
  export interface ZeroEntropyRerankOptions {
    model: string;
    query: string;
    documents: string[];
    top_n?: number;
  }

  /** API returns index into the `documents` array and an optional score. */
  export interface ZeroEntropyRerankResult {
    text?: string;
    document?: string;
    index?: number;
    relevance_score?: number;
  }

  export interface ZeroEntropyRerankResponse {
    results?: ZeroEntropyRerankResult[];
  }

  export interface ZeroEntropyClient {
    models: {
      rerank: (opts: ZeroEntropyRerankOptions) => Promise<ZeroEntropyRerankResponse>;
    };
  }

  export interface ZeroEntropyConstructorOptions {
    apiKey: string;
  }

  export class ZeroEntropy implements ZeroEntropyClient {
    constructor(options: ZeroEntropyConstructorOptions);
    models: ZeroEntropyClient["models"];
  }
}
