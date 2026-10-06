import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { env } from "../../_lib/env";
import { ExternalServiceError, InputValidationError } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import type { PaperRecord as BasePaperRecord } from "../../documents/paperRecord";

export interface PaperRecord extends BasePaperRecord {
  title: string;
  sourceType: "doi" | "bibtex" | "ris" | "zotero" | "mendeley" | "manual";
}

const DOI_REGEX = /^10\.\d{4,}\/.+/;
const USER_AGENT = "SolomindLM/1.0 (mailto:support@solomindlm.com)";

/** arXiv registers a DOI for every paper under this prefix, with DataCite rather than Crossref. */
const ARXIV_DOI_REGEX = /^10\.48550\/arxiv\.(.+)$/i;
/** New-style (2005.11401) and old-style (hep-th/9711200) arXiv identifiers, with an optional version. */
const ARXIV_ID = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?`;
const ARXIV_INPUT_REGEX = new RegExp(
  String.raw`^(?:arxiv:\s*|https?:\/\/(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/)?${ARXIV_ID}(?:\.pdf)?$`,
  "i"
);

const INVALID_INPUT_MESSAGE =
  "Enter a DOI (like 10.1038/s41586-020-2649-2) or an arXiv ID (like 2005.11401).";

/**
 * Turns what people paste into a bare DOI: strips doi.org links and `doi:` prefixes, and maps
 * arXiv IDs and arxiv.org links to arXiv's DOI. Anything else is returned trimmed, for
 * validation to reject.
 */
export function normalizeDoiInput(input: string): string {
  const trimmed = input.trim();
  const arxivId = trimmed.match(ARXIV_INPUT_REGEX)?.[1];
  if (arxivId) return `10.48550/arXiv.${arxivId}`;
  const doi = trimmed.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  const arxivDoiId = doi.match(ARXIV_DOI_REGEX)?.[1];
  return arxivDoiId ? `10.48550/arXiv.${arxivDoiId}` : doi;
}

/** Bibliographic fields shared by every registry the resolver reads. */
interface WorkMetadata {
  title: string;
  authors: string[];
  abstract: string;
  venue?: string;
  publicationYear?: number;
  landingPageUrl: string;
  pdfUrl?: string;
  license?: string;
}

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

interface DataciteWork {
  titles?: Array<{ title?: string; titleType?: string }>;
  creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
  descriptions?: Array<{ description?: string; descriptionType?: string }>;
  publicationYear?: number | string;
  publisher?: string | { name?: string };
  container?: { title?: string };
  url?: string;
  rightsList?: Array<{ rightsUri?: string }>;
}

interface DataciteResponse {
  data?: { attributes?: DataciteWork };
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

interface Registry {
  name: string;
  /** The work's metadata, or null when the registry has no such DOI. Throws when unreachable. */
  lookup: (doi: string) => Promise<WorkMetadata | null>;
}

export class DoiResolverService {
  private logger = createServiceLogger("doi_resolver", "DoiResolverService");

  private readonly crossref: Registry = {
    name: "crossref",
    lookup: async (doi) => {
      const work = await this.fetchCrossrefWork(doi);
      return work ? this.crossrefMetadata(work, doi) : null;
    },
  };

  private readonly datacite: Registry = {
    name: "datacite",
    lookup: async (doi) => {
      const work = await this.fetchDataciteWork(doi);
      return work ? this.dataciteMetadata(work, doi) : null;
    },
  };

  /**
   * The paper record for a DOI or arXiv ID, or null when no registry has it. Throws
   * ExternalServiceError when a registry that might have it could not be reached, so an outage
   * does not read as a bad DOI.
   */
  async resolve(input: string): Promise<PaperRecord | null> {
    const doi = normalizeDoiInput(input);
    if (!DOI_REGEX.test(doi)) {
      throw new InputValidationError(INVALID_INPUT_MESSAGE, { field: "doi" });
    }

    const arxivId = doi.match(ARXIV_DOI_REGEX)?.[1];
    // Crossref never has arXiv's DOIs; most other DOIs are Crossref's, and the rest (datasets,
    // repositories such as Zenodo) are DataCite's.
    const metadata = await this.lookupMetadata(
      doi,
      arxivId ? [this.datacite] : [this.crossref, this.datacite]
    );
    if (!metadata) {
      return null;
    }

    // Semantic Scholar adds an open-access PDF and the OpenAlex ID. It does not index arXiv's
    // DOIs, so arXiv papers are looked up by arXiv ID.
    const ssPaper = arxivId
      ? await this.fetchSemanticScholarPaper("ARXIV", arxivId)
      : await this.fetchSemanticScholarPaper("DOI", doi);

    const pdfUrl = arxivId
      ? `https://arxiv.org/pdf/${arxivId}`
      : ssPaper?.openAccessPdf?.url || metadata.pdfUrl;
    const openAlexId = ssPaper?.externalIds?.OpenAlex
      ? `https://openalex.org/${ssPaper.externalIds.OpenAlex}`
      : undefined;

    return {
      title: metadata.title,
      authors: metadata.authors,
      abstract: metadata.abstract,
      doi,
      venue: metadata.venue,
      publicationYear: metadata.publicationYear,
      pdfUrl: pdfUrl || undefined,
      landingPageUrl: metadata.landingPageUrl,
      openAlexId,
      semanticScholarId: ssPaper?.paperId,
      isOa: Boolean(pdfUrl) || Boolean(ssPaper?.isOpenAccess),
      license: metadata.license,
      sourceType: "doi",
    };
  }

  async resolveBatch(dois: string[]): Promise<(PaperRecord | null)[]> {
    const invalidDois = dois.filter((doi) => !DOI_REGEX.test(normalizeDoiInput(doi)));
    if (invalidDois.length > 0) {
      throw new InputValidationError(`Invalid DOI format(s): ${invalidDois.join(", ")}`, {
        field: "doi",
      });
    }

    // For batch, we could use Crossref's filter endpoint, but for simplicity
    // we'll resolve each DOI individually with concurrency control
    const results: (PaperRecord | null)[] = [];
    for (const doi of dois) {
      try {
        const result = await this.resolve(doi);
        results.push(result);
      } catch (error) {
        this.logger.error("Batch resolution failed for DOI", {
          doi,
          error: (error as Error).message,
        });
        results.push(null);
      }
    }
    return results;
  }

  /** Asks each registry in turn; the first that has the DOI wins. */
  private async lookupMetadata(doi: string, registries: Registry[]): Promise<WorkMetadata | null> {
    const unreachable: string[] = [];
    for (const registry of registries) {
      try {
        const metadata = await registry.lookup(doi);
        if (metadata) return metadata;
      } catch (error) {
        unreachable.push(registry.name);
        this.logger.error("DOI registry lookup failed", {
          doi,
          registry: registry.name,
          error: (error as Error).message,
        });
      }
    }
    if (unreachable.length > 0) {
      throw new ExternalServiceError(
        unreachable.join("+"),
        `DOI lookup failed: ${unreachable.join(", ")} unreachable`,
        {
          retryable: true,
          detail: "Couldn't reach the DOI registry to look this paper up. Try again in a minute.",
        }
      );
    }
    return null;
  }

  private async fetchCrossrefWork(doi: string): Promise<CrossrefWork | null> {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const data = await this.fetchJson<CrossrefResponse>("crossref", "/works", url, doi, {
      "User-Agent": USER_AGENT,
    });
    if (data?.status !== "ok" || !data.message) {
      return null;
    }
    return data.message;
  }

  private async fetchDataciteWork(doi: string): Promise<DataciteWork | null> {
    const url = `https://api.datacite.org/dois/${encodeURIComponent(doi)}`;
    const data = await this.fetchJson<DataciteResponse>("datacite", "/dois", url, doi, {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.api+json",
    });
    return data?.data?.attributes ?? null;
  }

  /** Semantic Scholar paper by DOI or arXiv ID; null when missing or unreachable. */
  private async fetchSemanticScholarPaper(
    idType: "DOI" | "ARXIV",
    id: string
  ): Promise<SemanticScholarPaper | null> {
    const paperId = `${idType}:${id}`;
    const url = `https://api.semanticscholar.org/graph/v1/paper/${idType}:${encodeURIComponent(id)}?fields=title,authors,year,abstract,openAccessPdf,externalIds,url,isOpenAccess`;

    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    if (env.SEMANTIC_SCHOLAR_API_KEY) {
      headers["x-api-key"] = env.SEMANTIC_SCHOLAR_API_KEY;
    }

    try {
      return await this.fetchJson<SemanticScholarPaper>(
        "semantic_scholar",
        "/graph/v1/paper",
        url,
        paperId,
        headers
      );
    } catch (error) {
      // Enrichment only: the record is complete without it.
      this.logger.error("Semantic Scholar resolution failed", {
        paperId,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /** GET with HTTP retry. Null on 404; throws ExternalServiceError on any other failure. */
  private async fetchJson<T>(
    service: string,
    endpoint: string,
    url: string,
    doi: string,
    headers: Record<string, string>
  ): Promise<T | null> {
    return await invokeWithHttpRetry(async () => {
      const t0 = Date.now();
      this.logger.apiCall(service, endpoint, { doi });

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.apiError(service, endpoint, new Error(`HTTP ${response.status}`), {
          status: response.status,
          doi,
        });
        if (response.status === 404) {
          return null;
        }
        throw createExternalServiceErrorFromResponse(
          service,
          response.status,
          endpoint,
          errorText.slice(0, 500)
        );
      }

      const data = (await response.json()) as T;
      this.logger.apiSuccess(service, endpoint, Date.now() - t0, { doi });
      return data;
    }, `${service}_doi_resolution`);
  }

  private crossrefMetadata(work: CrossrefWork, doi: string): WorkMetadata | null {
    const title = work.title?.[0]?.trim();
    if (!title) {
      this.logger.warn("Crossref work has no title", { doi });
      return null;
    }
    return {
      title,
      authors: this.extractCrossrefAuthors(work),
      abstract: this.cleanAbstract(work.abstract ?? ""),
      venue: work["container-title"]?.[0]?.trim() || undefined,
      publicationYear: this.extractCrossrefYear(work),
      landingPageUrl: work.URL || `https://doi.org/${doi}`,
      pdfUrl: this.findPdfLink(work),
      license: work.license?.[0]?.URL,
    };
  }

  private dataciteMetadata(work: DataciteWork, doi: string): WorkMetadata | null {
    const titles = work.titles ?? [];
    const title = (titles.find((t) => !t.titleType) ?? titles[0])?.title?.trim();
    if (!title) {
      this.logger.warn("DataCite work has no title", { doi });
      return null;
    }
    const descriptions = work.descriptions ?? [];
    const abstract = descriptions.find((d) => d.descriptionType === "Abstract") ?? descriptions[0];
    const publisher = typeof work.publisher === "string" ? work.publisher : work.publisher?.name;
    const year = Number(work.publicationYear);
    return {
      title,
      authors: (work.creators ?? [])
        .map((c) =>
          c.familyName
            ? [c.familyName, c.givenName]
                .filter(Boolean)
                .map((p) => p?.trim())
                .join(", ")
            : c.name?.trim()
        )
        .filter((name): name is string => Boolean(name)),
      abstract: this.cleanAbstract(abstract?.description ?? ""),
      venue: work.container?.title?.trim() || publisher?.trim() || undefined,
      publicationYear: year >= 1000 && year <= 9999 ? year : undefined,
      landingPageUrl: work.url || `https://doi.org/${doi}`,
      license: work.rightsList?.[0]?.rightsUri,
    };
  }

  private extractCrossrefAuthors(work: CrossrefWork): string[] {
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

  private extractCrossrefYear(work: CrossrefWork): number | undefined {
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
