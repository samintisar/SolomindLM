import { InputValidationError } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";

export interface PaperRecord {
  title: string;
  authors: string[];
  abstract: string;
  doi?: string;
  venue?: string;
  year?: number;
  pdfUrl?: string;
  landingPageUrl?: string;
  openAlexId?: string;
  isOa: boolean;
  sourceType: "doi" | "bibtex" | "ris" | "zotero" | "mendeley" | "manual";
}

interface CrossrefWork {
  title?: string[];
  author?: Array<{
    given?: string;
    family?: string;
    name?: string;
  }>;
  abstract?: string;
  "container-title"?: string[];
  published?: {
    "date-parts"?: number[][];
  };
  published_print?: {
    "date-parts"?: number[][];
  };
  URL?: string;
  DOI?: string;
}

interface CrossrefResponse {
  message?: {
    items?: CrossrefWork[];
  } & CrossrefWork;
}

interface SemanticScholarPaper {
  openAccessPdf?: {
    url?: string;
  } | null;
  externalIds?: {
    DOI?: string;
    OpenAlex?: string;
  };
}

interface OpenAlexWork {
  title?: string;
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
  abstract_inverted_index?: Record<string, number[]>;
  host_venue?: {
    display_name?: string;
  };
  publication_year?: number;
  doi?: string;
  open_access?: {
    oa_url?: string;
  };
  ids?: {
    openalex?: string;
  };
}

const DOI_REGEX = /^10\.\d{4,}\/.+/;

export class DoiResolverService {
  private logger = createServiceLogger("doi_resolver", "DoiResolverService");

  async resolve(doi: string): Promise<PaperRecord | null> {
    this.logger.operationStart({ doi });

    if (!DOI_REGEX.test(doi)) {
      throw new InputValidationError(`Invalid DOI format: ${doi}`, { field: "doi" });
    }

    try {
      const crossrefData = await this.queryCrossref(doi);
      if (!crossrefData) {
        this.logger.info("DOI not found in Crossref", { doi });
        return null;
      }

      const semanticScholarData = await this.querySemanticScholar(doi);

      let pdfUrl = semanticScholarData?.openAccessPdf?.url;
      let openAlexId = semanticScholarData?.externalIds?.OpenAlex;

      if (!pdfUrl) {
        const openAlexData = await this.queryOpenAlex(doi);
        if (openAlexData) {
          pdfUrl = openAlexData.open_access?.oa_url;
          if (!openAlexId) {
            openAlexId = openAlexData.ids?.openalex;
          }
        }
      }

      const record = this.buildPaperRecord(crossrefData, pdfUrl, openAlexId);
      this.logger.operationComplete({ doi, title: record.title });
      return record;
    } catch (error) {
      this.logger.operationError(error, { doi });
      throw error;
    }
  }

  async resolveBatch(dois: string[]): Promise<(PaperRecord | null)[]> {
    this.logger.operationStart({ count: dois.length });

    const invalidDois = dois.filter((doi) => !DOI_REGEX.test(doi));
    if (invalidDois.length > 0) {
      throw new InputValidationError(`Invalid DOI format(s): ${invalidDois.join(", ")}`, {
        field: "doi",
      });
    }

    try {
      const crossrefData = await this.queryCrossrefBatch(dois);
      const semanticScholarData = await this.querySemanticScholarBatch(dois);

      // Identify DOIs with Crossref data but without PDF from Semantic Scholar for OpenAlex fallback
      const doisWithCrossrefData = dois.filter((doi) => crossrefData[doi.toLowerCase()]);
      const doisWithoutPdf = doisWithCrossrefData.filter((doi) => {
        const paper = semanticScholarData[doi.toLowerCase()];
        return !paper?.openAccessPdf?.url;
      });

      let openAlexData: Record<string, OpenAlexWork> = {};
      if (doisWithoutPdf.length > 0) {
        openAlexData = await this.queryOpenAlexBatch(doisWithoutPdf);
      }

      const results = dois.map((doi) => {
        const crossrefWork = crossrefData[doi.toLowerCase()];
        if (!crossrefWork) {
          return null;
        }

        const semanticScholarPaper = semanticScholarData[doi.toLowerCase()];
        let pdfUrl = semanticScholarPaper?.openAccessPdf?.url;
        let openAlexId = semanticScholarPaper?.externalIds?.OpenAlex;

        if (!pdfUrl) {
          const openAlexWork = openAlexData[doi.toLowerCase()];
          if (openAlexWork) {
            pdfUrl = openAlexWork.open_access?.oa_url;
            if (!openAlexId) {
              openAlexId = openAlexWork.ids?.openalex;
            }
          }
        }

        return this.buildPaperRecord(crossrefWork, pdfUrl, openAlexId);
      });

      this.logger.operationComplete({ count: dois.length, resolved: results.filter(Boolean).length });
      return results;
    } catch (error) {
      this.logger.operationError(error, { count: dois.length });
      throw error;
    }
  }

  private async queryCrossref(doi: string): Promise<CrossrefWork | null> {
    return invokeWithHttpRetry(
      async () => {
        this.logger.apiCall("crossref", `/works/${doi}`);
        const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
          headers: {
            "User-Agent": "SolomindLM/1.0 (mailto:team@solomind.ai)",
          },
        });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`Crossref API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as CrossrefResponse;
        return data.message ?? null;
      },
      "crossref_single"
    );
  }

  private async queryCrossrefBatch(dois: string[]): Promise<Record<string, CrossrefWork>> {
    if (dois.length === 0) return {};

    return invokeWithHttpRetry(
      async () => {
        const filter = dois.map((doi) => `doi:${encodeURIComponent(doi)}`).join(",");
        this.logger.apiCall("crossref", `/works?filter=${filter}`);
        const response = await fetch(`https://api.crossref.org/works?filter=${filter}&rows=${dois.length}`, {
          headers: {
            "User-Agent": "SolomindLM/1.0 (mailto:team@solomind.ai)",
          },
        });

        if (!response.ok) {
          throw new Error(`Crossref batch API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as CrossrefResponse;
        const works = data.message?.items ?? [];
        const map: Record<string, CrossrefWork> = {};

        for (const work of works) {
          if (work.DOI) {
            map[work.DOI.toLowerCase()] = work;
          }
        }

        return map;
      },
      "crossref_batch"
    );
  }

  private async querySemanticScholar(doi: string): Promise<SemanticScholarPaper | null> {
    return invokeWithHttpRetry(
      async () => {
        this.logger.apiCall("semantic_scholar", `/graph/v1/paper/DOI:${doi}`);
        const response = await fetch(
          `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=openAccessPdf,externalIds`,
          {
            headers: {
              "User-Agent": "SolomindLM/1.0",
            },
          }
        );

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`Semantic Scholar API error: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as SemanticScholarPaper;
      },
      "semantic_scholar_single"
    );
  }

  private async querySemanticScholarBatch(dois: string[]): Promise<Record<string, SemanticScholarPaper>> {
    if (dois.length === 0) return {};

    return invokeWithHttpRetry(
      async () => {
        this.logger.apiCall("semantic_scholar", `/graph/v1/paper/batch`);
        const response = await fetch(`https://api.semanticscholar.org/graph/v1/paper/batch?fields=openAccessPdf,externalIds`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SolomindLM/1.0",
          },
          body: JSON.stringify({
            ids: dois.map((doi) => `DOI:${doi}`),
          }),
        });

        if (!response.ok) {
          throw new Error(`Semantic Scholar batch API error: ${response.status} ${response.statusText}`);
        }

        const papers = (await response.json()) as (SemanticScholarPaper | null)[];
        const map: Record<string, SemanticScholarPaper> = {};

        for (let i = 0; i < dois.length; i++) {
          const paper = papers[i];
          if (paper) {
            map[dois[i].toLowerCase()] = paper;
          }
        }

        return map;
      },
      "semantic_scholar_batch"
    );
  }

  private async queryOpenAlex(doi: string): Promise<OpenAlexWork | null> {
    return invokeWithHttpRetry(
      async () => {
        this.logger.apiCall("openalex", `/works/doi:${doi}`);
        const response = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`, {
          headers: {
            "User-Agent": "mailto:team@solomind.ai",
          },
        });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`OpenAlex API error: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as OpenAlexWork;
      },
      "openalex_fallback"
    );
  }

  private async queryOpenAlexBatch(dois: string[]): Promise<Record<string, OpenAlexWork>> {
    if (dois.length === 0) return {};

    return invokeWithHttpRetry(
      async () => {
        const filter = dois.map((doi) => `doi:${encodeURIComponent(doi)}`).join("|");
        this.logger.apiCall("openalex", `/works?filter=${filter}`);
        const response = await fetch(
          `https://api.openalex.org/works?filter=${filter}&per_page=${dois.length}`,
          {
            headers: {
              "User-Agent": "mailto:team@solomind.ai",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`OpenAlex batch API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const works = data.results ?? [];
        const map: Record<string, OpenAlexWork> = {};

        for (const work of works) {
          if (work.doi) {
            // OpenAlex returns DOI as https://doi.org/10.1234/...
            const normalizedDoi = work.doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase();
            map[normalizedDoi] = work;
          }
        }

        return map;
      },
      "openalex_batch"
    );
  }

  private buildPaperRecord(
    crossrefWork: CrossrefWork,
    pdfUrl?: string,
    openAlexId?: string
  ): PaperRecord {
    const title = crossrefWork.title?.[0] ?? "Unknown Title";
    const authors =
      crossrefWork.author?.map((a) => {
        if (a.name) return a.name;
        const parts = [a.given, a.family].filter(Boolean);
        return parts.join(" ") || "Unknown Author";
      }) ?? [];

    const abstract = crossrefWork.abstract
      ? crossrefWork.abstract.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : "";

    const venue = crossrefWork["container-title"]?.[0];

    const year =
      crossrefWork.published?.["date-parts"]?.[0]?.[0] ??
      crossrefWork.published_print?.["date-parts"]?.[0]?.[0];

    const doi = crossrefWork.DOI;
    const landingPageUrl = crossrefWork.URL;
    const isOa = !!pdfUrl;

    return {
      title,
      authors,
      abstract,
      doi,
      venue,
      year,
      pdfUrl,
      landingPageUrl,
      openAlexId,
      isOa,
      sourceType: "doi",
    };
  }
}
