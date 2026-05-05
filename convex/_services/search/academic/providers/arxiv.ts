"use node";

import { createServiceLogger } from "../../../../_lib/logging/serviceLogger";
import {
  createExternalServiceErrorFromResponse,
  ExternalServiceError,
  isRetryableHttpStatus,
} from "../../../../_lib/errors";
import { AcademicPaper, AcademicSearchFilters } from "../types";
import {
  extractTag,
  extractAllTags,
  stripXmlTags,
  extractAttribute,
  extractXmlBlocks,
} from "../utils/xmlParsing";
import { calculateScore } from "../utils/paperProcessing";
import { arxivQueue } from "../utils/providerQueue";

export async function searchArxiv(
  query: string,
  maxResults: number,
  _filters: AcademicSearchFilters
): Promise<AcademicPaper[]> {
  return arxivQueue.enqueue(async () => {
    const logger = createServiceLogger("academic_search", "searchArxiv");
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

    // Custom retry config for arXiv: 3s base delay per their docs (1 request every 3 seconds)
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 3000;

    let lastError: Error | undefined;
    let retryAfterMs: number | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const t0 = Date.now();
        logger.apiCall("arxiv", "/api/query", { query: query.substring(0, 50) });

        const response = await fetch(url, {
          headers: {
            "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          const status = response.status;

          logger.apiError("arxiv", "/api/query", new Error(`HTTP ${status}`), {
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
            "arxiv",
            status,
            "/api/query",
            errorText.slice(0, 500)
          );
        }

        const xml = await response.text();
        logger.apiSuccess("arxiv", "/api/query", Date.now() - t0, { maxResults });

        const entries = extractXmlBlocks(xml, "entry");
        const papers: AcademicPaper[] = [];

        for (const entry of entries) {
          const title = stripXmlTags(extractTag(entry, "title") || "Untitled");
          const summary = stripXmlTags(extractTag(entry, "summary") || "");
          const published = extractTag(entry, "published");
          let year = published ? parseInt(published.substring(0, 4), 10) : undefined;
          if (year !== undefined && isNaN(year)) {
            year = undefined;
          }

          // Extract authors from <author><name>...</name></author>
          const authorNames = extractAllTags(entry, "name");

          // Extract links: prefer rel="alternate" for HTML, look for PDF
          let articleUrl = "";
          let pdfUrl: string | undefined;

          const linkRegex = /<link\s+([^>]+)\/>/gi;
          let linkMatch;
          while ((linkMatch = linkRegex.exec(entry)) !== null) {
            const attrs = linkMatch[1];
            const href = extractAttribute(attrs, "href");
            const rel = extractAttribute(attrs, "rel");
            const type = extractAttribute(attrs, "type");
            const linkTitle = extractAttribute(attrs, "title");

            if (href) {
              if (rel === "alternate" && !articleUrl) {
                articleUrl = href;
              }
              if ((type === "application/pdf" || linkTitle === "pdf") && !pdfUrl) {
                pdfUrl = href;
              }
            }
          }

          // Fallback: construct URL from arXiv ID if present
          if (!articleUrl) {
            const idMatch = entry.match(/<id>([^<]+)<\/id>/);
            if (idMatch) {
              articleUrl = idMatch[1].trim();
            }
          }

          // arXiv entries don't have DOI or citation count in the basic API
          const doi = extractTag(entry, "doi") || undefined;

          const basePaper: Omit<AcademicPaper, "score"> = {
            title,
            authors: authorNames,
            year,
            abstract: summary,
            url: articleUrl || `https://arxiv.org/search/?query=${encodeURIComponent(query)}`,
            pdfUrl,
            source: "arxiv",
            citationCount: undefined,
            doi,
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

        // Calculate delay: respect Retry-After if present, else use 3s base delay with jitter
        let delayMs = retryAfterMs ?? BASE_DELAY_MS;
        // Add +/-25% jitter
        const jitterAmount = delayMs * 0.25;
        delayMs = Math.max(0, Math.floor(delayMs + (Math.random() - 0.5) * 2 * jitterAmount));

        logger.info("Retrying arXiv after delay", { attempt: attempt + 1, delayMs });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError ?? new Error("arXiv search failed after all retries");
  });
}
