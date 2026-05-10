import { InputValidationError, ExternalServiceError } from "../../_lib/errors";
import { env } from "../../_lib/env";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import type { PaperRecord as BasePaperRecord } from "../../documents/paperRecord";

export interface PaperRecord extends BasePaperRecord {
  title: string;
  sourceType: "doi" | "bibtex" | "ris" | "zotero" | "mendeley" | "manual";
}

const DOI_REGEX = /^10\.\d{4,}\/.+/;

interface CrossrefWork {
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  abstract?: string;
  DOI?: string;
  "container-title"?: string[];
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  link?: Array<{ URL?: string; "content-type"?: string }>;
  license?: Array<{ URL?: string }>;
  URL?: string;
  type?: string;
  subtype?: string;
}

interface CrossrefResponse {
  status?: string;
  message?: CrossrefWork;
}

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  year?: number;
  abstract?: string;
  openAccessPdf?: { url?: string } | null;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    OpenAlex?: string;
  };
  url?: string;
  isOpenAccess?: boolean;
}

export class DoiResolverService {
  private logger = createServiceLogger("doi_resolver", "DoiResolverService");

  async resolve(doi: string): Promise<PaperRecord | null> {
    if (!DOI_REGEX.test(doi)) {
      throw new InputValidationError(`Invalid DOI format: ${doi}`, { field: "doi" });
    }

    // Fetch Crossref metadata
    const crossrefWork = await this.fetchCrossrefWork(doi);
    if (!crossrefWork) {
      return null;
    }

    // Fetch Semantic Scholar for PDF and OpenAlex ID
    const ssPaper = await this.fetchSemanticScholarPaper(doi);

    const title = this.extractTitle(crossrefWork);
    if (!title) {
      this.logger.warn("Crossref work has no title", { doi });
      return null;
    }

    const authors = this.extractAuthors(crossrefWork);
    const abstract = this.cleanAbstract(crossrefWork.abstract ?? "");
    const venue = this.extractVenue(crossrefWork);
    const year = this.extractYear(crossrefWork);

    const pdfUrl = ssPaper?.openAccessPdf?.url || this.findPdfLink(crossrefWork);
    const landingPageUrl = crossrefWork.URL || `https://doi.org/${doi}`;
    const openAlexId = ssPaper?.externalIds?.OpenAlex
      ? `https://openalex.org/${ssPaper.externalIds.OpenAlex}`
      : undefined;
    const semanticScholarId = ssPaper?.paperId;
    const isOa = Boolean(pdfUrl) || Boolean(ssPaper?.isOpenAccess);
    const license = crossrefWork.license?.[0]?.URL;

    return {
      title,
      authors,
      abstract,
      doi,
      venue,
      publicationYear: year,
      pdfUrl: pdfUrl || undefined,
      landingPageUrl,
      openAlexId,
      semanticScholarId,
      isOa,
      license,
      sourceType: "doi",
    };
  }

  async resolveBatch(dois: string[]): Promise<(PaperRecord | null)[]> {
    const invalidDois = dois.filter((doi) => !DOI_REGEX.test(doi));
    if (invalidDois.length > 0) {
      throw new InputValidationError(
        `Invalid DOI format(s): ${invalidDois.join(", ")}`,
        { field: "doi" }
      );
    }

    // For batch, we could use Crossref's filter endpoint, but for simplicity
    // we'll resolve each DOI individually with concurrency control
    const results: (PaperRecord | null)[] = [];
    for (const doi of dois) {
      try {
        const result = await this.resolve(doi);
        results.push(result);
      } catch (error) {
        this.logger.error("Batch resolution failed for DOI", { doi, error: (error as Error).message });
        results.push(null);
      }
    }
    return results;
  }

  private async fetchCrossrefWork(doi: string): Promise<CrossrefWork | null> {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

    try {
      return await invokeWithHttpRetry(
        async () => {
          const t0 = Date.now();
          this.logger.apiCall("crossref", "/works", { doi });

          const response = await fetch(url, {
            headers: {
              "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.apiError("crossref", "/works", new Error(`HTTP ${response.status}`), {
              status: response.status,
              doi,
            });
            if (response.status === 404) {
              return null;
            }
            throw createExternalServiceErrorFromResponse(
              "crossref",
              response.status,
              "/works",
              errorText.slice(0, 500)
            );
          }

          const data = (await response.json()) as CrossrefResponse;
          this.logger.apiSuccess("crossref", "/works", Date.now() - t0, { doi });

          if (data.status !== "ok" || !data.message) {
            return null;
          }

          return data.message;
        },
        "crossref_doi_resolution"
      );
    } catch (error) {
      this.logger.error("Crossref resolution failed", { doi, error: (error as Error).message });
      return null;
    }
  }

  private async fetchSemanticScholarPaper(doi: string): Promise<SemanticScholarPaper | null> {
    const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,authors,year,abstract,openAccessPdf,externalIds,url,isOpenAccess`;

    const headers: Record<string, string> = {
      "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
    };
    if (env.SEMANTIC_SCHOLAR_API_KEY) {
      headers["x-api-key"] = env.SEMANTIC_SCHOLAR_API_KEY;
    }

    try {
      return await invokeWithHttpRetry(
        async () => {
          const t0 = Date.now();
          this.logger.apiCall("semantic_scholar", "/graph/v1/paper/DOI", { doi });

          const response = await fetch(url, { headers });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.apiError(
              "semantic_scholar",
              "/graph/v1/paper/DOI",
              new Error(`HTTP ${response.status}`),
              { status: response.status, doi }
            );
            if (response.status === 404) {
              return null;
            }
            throw createExternalServiceErrorFromResponse(
              "semantic_scholar",
              response.status,
              "/graph/v1/paper/DOI",
              errorText.slice(0, 500)
            );
          }

          const data = (await response.json()) as SemanticScholarPaper;
          this.logger.apiSuccess("semantic_scholar", "/graph/v1/paper/DOI", Date.now() - t0, {
            doi,
          });

          return data;
        },
        "semantic_scholar_doi_resolution"
      );
    } catch (error) {
      this.logger.error("Semantic Scholar resolution failed", {
        doi,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private extractTitle(work: CrossrefWork): string | undefined {
    const title = work.title?.[0];
    return title?.trim() || undefined;
  }

  private extractAuthors(work: CrossrefWork): string[] {
    if (!work.author?.length) return [];

    return work.author
      .map((author) => {
        if (author.name) return author.name.trim();
        const parts: string[] = [];
        if (author.family) parts.push(author.family.trim());
        if (author.given) parts.push(author.given.trim());
        if (parts.length === 0) return undefined;
        return parts.join(", ");
      })
      .filter((name): name is string => Boolean(name));
  }

  private extractVenue(work: CrossrefWork): string | undefined {
    return work["container-title"]?.[0]?.trim() || undefined;
  }

  private extractYear(work: CrossrefWork): number | undefined {
    const dateParts =
      work["published-print"]?.["date-parts"] ??
      work["published-online"]?.["date-parts"] ??
      work.published?.["date-parts"] ??
      work.issued?.["date-parts"];

    if (dateParts?.[0]?.[0]) {
      const year = dateParts[0][0];
      if (typeof year === "number" && year >= 1000 && year <= 9999) {
        return year;
      }
    }
    return undefined;
  }

  private findPdfLink(work: CrossrefWork): string | undefined {
    if (!work.link?.length) return undefined;

    // Prefer PDF content type
    const pdfLink = work.link.find(
      (l) => l["content-type"] === "application/pdf" || l.URL?.endsWith(".pdf")
    );
    if (pdfLink?.URL) return pdfLink.URL;

    // Otherwise take any link that looks like a PDF
    return work.link[0]?.URL || undefined;
  }

  private cleanAbstract(abstract: string): string {
    if (!abstract) return "";

    // Crossref abstracts are sometimes JATS XML
    // Try to extract text from JATS tags
    let cleaned = abstract;

    // Remove JATS XML tags
    cleaned = cleaned.replace(/<\/?jats:[^>]+>/g, "");
    cleaned = cleaned.replace(/<\/?[^>]+>/g, " ");

    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  }
}

function createExternalServiceErrorFromResponse(
  service: string,
  status: number | undefined,
  endpoint: string | undefined,
  bodySnippet?: string
): ExternalServiceError {
  const retryable = [408, 425, 429, 500, 502, 503, 504].includes(status ?? 0);
  const message = bodySnippet
    ? `${service} HTTP ${status ?? "error"}: ${bodySnippet.slice(0, 200)}`
    : `${service} HTTP ${status ?? "error"}`;
  return new ExternalServiceError(service, message, {
    statusCode: status,
    retryable,
    endpoint,
    detail: message,
  });
}
