import { createServiceLogger } from "../../../../_lib/logging/serviceLogger";
import {
  createExternalServiceErrorFromResponse,
  ExternalServiceError,
  isRetryableHttpStatus,
} from "../../../../_lib/errors";
import { env } from "../../../../_lib/env";
import { AcademicPaper, AcademicSearchFilters } from "../types";
import { calculateScore } from "../utils/paperProcessing";
import { semanticScholarQueue } from "../utils/providerQueue";

export async function searchSemanticScholar(
  query: string,
  maxResults: number,
  _filters: AcademicSearchFilters
): Promise<AcademicPaper[]> {
  return semanticScholarQueue.enqueue(async () => {
    const logger = createServiceLogger("academic_search", "searchSemanticScholar");
  const fields =
    "title,authors,year,abstract,openAccessPdf,citationCount,externalIds,url,fieldsOfStudy";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=${fields}&limit=${maxResults}`;

  const headers: Record<string, string> = {
    "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
  };
  if (env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = env.SEMANTIC_SCHOLAR_API_KEY;
  }

  // Custom retry config for Semantic Scholar rate limits
  const MAX_ATTEMPTS = 5;
  const BASE_DELAY_MS = 2000;

  let lastError: Error | undefined;
  let retryAfterMs: number | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const t0 = Date.now();
      logger.apiCall("semantic_scholar", "/graph/v1/paper/search", {
        query: query.substring(0, 50),
      });

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        logger.apiError("semantic_scholar", "/graph/v1/paper/search", new Error(`HTTP ${status}`), {
          status,
        });

        // Check for Retry-After header on 429
        retryAfterMs = undefined;
        if (status === 429) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
              retryAfterMs = parsed * 1000;
            }
          }
        }

        throw createExternalServiceErrorFromResponse(
          "semantic_scholar",
          status,
          "/graph/v1/paper/search",
          errorText.slice(0, 500)
        );
      }

      const data = (await response.json()) as {
        data?: Array<{
          paperId?: string;
          title?: string;
          authors?: Array<{ name?: string }>;
          year?: number;
          abstract?: string;
          openAccessPdf?: { url?: string } | null;
          citationCount?: number;
          externalIds?: { DOI?: string; ArXiv?: string };
          url?: string;
          fieldsOfStudy?: string[];
        }>;
      };

      logger.apiSuccess("semantic_scholar", "/graph/v1/paper/search", Date.now() - t0, {
        maxResults,
      });

      const papers: AcademicPaper[] = [];
      const items = data.data || [];

      for (const item of items) {
        const title = item.title || "Untitled";
        const authors = (item.authors || []).map((a) => a.name).filter(Boolean) as string[];
        const abstract = item.abstract || "";
        const pdfUrl = item.openAccessPdf?.url || undefined;
        const doi = item.externalIds?.DOI || undefined;
        const url = item.url || `https://www.semanticscholar.org/paper/${item.paperId || ""}`;

        const basePaper: Omit<AcademicPaper, "score"> = {
          title,
          authors,
          year: item.year,
          abstract,
          url,
          pdfUrl,
          source: "semantic_scholar",
          citationCount: item.citationCount,
          doi,
          fieldsOfStudy: item.fieldsOfStudy,
        };

        papers.push({ ...basePaper, score: calculateScore(basePaper) });
      }

      return papers;
    } catch (error) {
      lastError = error as Error;

      const isRetryable =
        lastError instanceof ExternalServiceError
          ? lastError.retryable
          : (() => {
              const m = lastError.message.match(/\bHTTP\s+(\d{3})\b/i);
              if (m) return isRetryableHttpStatus(parseInt(m[1], 10));
              return false;
            })();

      if (!isRetryable || attempt >= MAX_ATTEMPTS - 1) {
        break;
      }

      // Calculate delay: respect Retry-After if present, else exponential backoff with jitter
      let delayMs = retryAfterMs ?? BASE_DELAY_MS * Math.pow(2, attempt);
      // Add ±25% jitter
      const jitterAmount = delayMs * 0.25;
      delayMs = Math.max(0, Math.floor(delayMs + (Math.random() - 0.5) * 2 * jitterAmount));

      logger.info("Retrying Semantic Scholar after delay", { attempt: attempt + 1, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error("Semantic Scholar search failed after all retries");
  });
}
