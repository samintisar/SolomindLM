"use node";

import { createServiceLogger } from "../../../../_lib/logging/serviceLogger";
import { createExternalServiceErrorFromResponse } from "../../../../_lib/errors";
import { invokeWithHttpRetry } from "../../../../_agents/_shared/retry";
import { env } from "../../../../_lib/env";
import { AcademicPaper, AcademicSearchFilters } from "../types";
import {
  extractTag,
  extractAllTags,
  stripXmlTags,
  extractXmlBlocks,
} from "../utils/xmlParsing";
import { calculateScore } from "../utils/paperProcessing";
import { pubmedQueue } from "../utils/providerQueue";

export async function searchPubMed(
  query: string,
  maxResults: number,
  _filters: AcademicSearchFilters
): Promise<AcademicPaper[]> {
  return pubmedQueue.enqueue(async () => {
    const logger = createServiceLogger("academic_search", "searchPubMed");
  const email = env.PUBMED_EMAIL || "support@solomindlm.com";

  // Step 1: esearch to get PMC IDs
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${encodeURIComponent(query)}&retmax=${maxResults}&sort=relevance&retmode=json&email=${encodeURIComponent(email)}`;

  const idList = await invokeWithHttpRetry(async () => {
    const t0 = Date.now();
    logger.apiCall("pubmed", "esearch", { query: query.substring(0, 50) });

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.apiError("pubmed", "esearch", new Error(`HTTP ${response.status}`), {
        status: response.status,
      });
      throw createExternalServiceErrorFromResponse(
        "pubmed",
        response.status,
        "esearch",
        errorText.slice(0, 500)
      );
    }

    const data = (await response.json()) as {
      esearchresult?: { idlist?: string[] };
    };

    logger.apiSuccess("pubmed", "esearch", Date.now() - t0, {
      count: data.esearchresult?.idlist?.length ?? 0,
    });

    return data.esearchresult?.idlist || [];
  }, "pubmed_esearch");

  if (idList.length === 0) {
    return [];
  }

  // Step 2: efetch to get metadata
  const ids = idList.join(",");
  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${ids}&retmode=xml&email=${encodeURIComponent(email)}`;

  return invokeWithHttpRetry(async () => {
    const t0 = Date.now();
    logger.apiCall("pubmed", "efetch", { idCount: idList.length });

    const response = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "SolomindLM/1.0 (mailto:support@solomindlm.com)",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.apiError("pubmed", "efetch", new Error(`HTTP ${response.status}`), {
        status: response.status,
      });
      throw createExternalServiceErrorFromResponse(
        "pubmed",
        response.status,
        "efetch",
        errorText.slice(0, 500)
      );
    }

    const xml = await response.text();
    logger.apiSuccess("pubmed", "efetch", Date.now() - t0, { idCount: idList.length });

    const articles = extractXmlBlocks(xml, "article");
    const papers: AcademicPaper[] = [];

    for (const article of articles) {
      const title = stripXmlTags(extractTag(article, "article-title") || "Untitled");

      let abstractText: string;
      const abstractBlocks = extractXmlBlocks(article, "abstract");
      if (abstractBlocks.length > 0) {
        abstractText = stripXmlTags(abstractBlocks[0]);
      } else {
        abstractText = stripXmlTags(extractTag(article, "abstract") || "");
      }

      const authors: string[] = [];
      const contribRegex = /<contrib[^>]*contrib-type=["']author["'][^>]*>([\s\S]*?)<\/contrib>/gi;
      let contribMatch;
      while ((contribMatch = contribRegex.exec(article)) !== null) {
        const contribXml = contribMatch[1];
        const surname = extractTag(contribXml, "surname");
        const givenNames = extractTag(contribXml, "given-names");
        const stringName = extractTag(contribXml, "string-name");
        const collectiveName = extractTag(contribXml, "collective-name");

        if (surname && givenNames) {
          authors.push(`${givenNames} ${surname}`);
        } else if (stringName) {
          authors.push(stringName);
        } else if (collectiveName) {
          authors.push(collectiveName);
        } else if (surname) {
          authors.push(surname);
        }
      }

      let year: number | undefined;
      const pubDateBlocks = extractXmlBlocks(article, "pub-date");
      if (pubDateBlocks.length > 0) {
        const yearStr = extractTag(pubDateBlocks[0], "year");
        if (yearStr) {
          year = parseInt(yearStr, 10);
          if (isNaN(year)) {
            year = undefined;
          }
        }
      }
      if (!year) {
        const yearStr = extractTag(article, "year");
        if (yearStr) {
          year = parseInt(yearStr, 10);
          if (isNaN(year)) {
            year = undefined;
          }
        }
      }

      let doi: string | undefined;
      const articleIdRegex = /<article-id[^>]*pub-id-type=["']doi["'][^>]*>([^<]*)<\/article-id>/gi;
      let idMatch;
      while ((idMatch = articleIdRegex.exec(article)) !== null) {
        if (idMatch[1].trim()) {
          doi = idMatch[1].trim();
          break;
        }
      }

      let pmcId: string | undefined;
      const pmcIdRegex = /<article-id[^>]*pub-id-type=["']pmc["'][^>]*>([^<]*)<\/article-id>/gi;
      let pmcMatch;
      while ((pmcMatch = pmcIdRegex.exec(article)) !== null) {
        if (pmcMatch[1].trim()) {
          pmcId = pmcMatch[1].trim();
          break;
        }
      }

      if (!pmcId) {
        const allIds = extractAllTags(article, "article-id");
        const numericId = allIds.find((id) => /^\d+$/.test(id));
        if (numericId) {
          pmcId = numericId;
        }
      }

      const url = pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/`
        : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`;
      const pdfUrl = pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/pdf/`
        : undefined;

      const basePaper: Omit<AcademicPaper, "score"> = {
        title,
        authors,
        year,
        abstract: abstractText,
        url,
        pdfUrl,
        source: "pubmed",
        citationCount: undefined,
        doi,
      };

      papers.push({ ...basePaper, score: calculateScore(basePaper) });
    }

    return papers;
  }, "pubmed_efetch");
  });
}
