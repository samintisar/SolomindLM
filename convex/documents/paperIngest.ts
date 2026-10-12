/**
 * How a paper source gets its text (#480). Stops at the first step that yields full text:
 *   1. a PDF already stored on the source (uploaded, or found by an earlier import), OCR'd;
 *   2. open-access candidates, best version first: PDFs are stored and OCR'd, HTML pages scraped;
 *   3. the landing page, scraped;
 *   4. otherwise the title + abstract stub, marked abstract only.
 * Scraped text must pass `isFullTextLength`. All I/O comes in through `deps`, so this is unit-tested
 * without Convex; `embeddingJob` supplies the real storage, OCR and scraper.
 */

import type { FetchedCandidate } from "../_services/extraction/openAccess/fetchOaCandidate";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import type {
  OaCandidate,
  OaResolverInput,
} from "../_services/extraction/openAccess/OpenAccessResolver";
import { buildPaperMetadataMarkdown, type FullTextSource, type PaperRecord } from "./paperRecord";

export const MAX_CANDIDATE_ATTEMPTS = 6;
/** Keeps the whole embedding job well inside Convex's 600 s action limit. */
export const CANDIDATE_BUDGET_MS = 180_000;

export interface PaperIngestInput {
  title: string;
  paperRecord: PaperRecord;
  fileUrl?: string;
  storageId?: string;
  fullTextSource?: FullTextSource;
}

export interface PaperIngestDeps {
  resolveCandidates(input: OaResolverInput): Promise<OaCandidate[]>;
  fetchCandidate(url: string): Promise<FetchedCandidate>;
  /** Stores PDF bytes, points the document at them (replacing any earlier PDF), returns the storage id. */
  attachPdf(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
  /** Deletes a stored PDF and clears the document's storage id. */
  detachPdf(storageId: string): Promise<void>;
  ocrStoredPdf(storageId: string): Promise<string>;
  scrape(url: string): Promise<{ title?: string; content: string }>;
  now(): number;
}

export interface IngestLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

export type PaperIngestResult =
  | { outcome: "full_text"; content: string; title?: string; fullTextSource: FullTextSource }
  | { outcome: "abstract_only"; content: string };

type FullTextResult = Extract<PaperIngestResult, { outcome: "full_text" }>;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Drops undefined fields so the object is a valid Convex value. */
function compactSource(source: FullTextSource): FullTextSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined)
  ) as FullTextSource;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

async function ocrText(
  deps: PaperIngestDeps,
  storageId: string,
  logger: IngestLogger
): Promise<string | null> {
  try {
    const text = (await deps.ocrStoredPdf(storageId)).trim();
    if (!text) logger.warn("PDF OCR returned no text", { storageId });
    return text || null;
  } catch (e) {
    logger.warn("PDF OCR failed", { storageId, error: errorMessage(e) });
    return null;
  }
}

async function fullTextPage(
  deps: PaperIngestDeps,
  url: string,
  abstract: string,
  logger: IngestLogger
): Promise<{ title?: string; content: string } | null> {
  try {
    const page = await deps.scrape(url);
    if (isFullTextLength(page.content, abstract)) return page;
    logger.info("Scraped page is too short to be the full text", {
      url,
      contentLength: page.content.length,
    });
  } catch (e) {
    logger.warn("Scrape failed", { url, error: errorMessage(e) });
  }
  return null;
}

async function tryCandidate(
  candidate: OaCandidate,
  abstract: string,
  deps: PaperIngestDeps,
  logger: IngestLogger
): Promise<FullTextResult | null> {
  const fetched = await deps.fetchCandidate(candidate.url);
  const provenance = {
    url: candidate.url,
    version: candidate.version,
    license: candidate.license,
    host: candidate.host,
  };

  if (fetched.type === "pdf") {
    let storageId: string;
    try {
      storageId = await deps.attachPdf(fetched.bytes);
    } catch (e) {
      logger.warn("Storing open-access PDF failed", { url: candidate.url, error: errorMessage(e) });
      return null;
    }
    const text = await ocrText(deps, storageId, logger);
    if (text) {
      return {
        outcome: "full_text",
        content: text,
        fullTextSource: compactSource({ method: "oa_pdf", ...provenance }),
      };
    }
    await deps
      .detachPdf(storageId)
      .catch((e) =>
        logger.warn("Deleting unreadable PDF failed", { storageId, error: errorMessage(e) })
      );
    return null;
  }

  if (fetched.type === "html") {
    const page = await fullTextPage(deps, fetched.finalUrl, abstract, logger);
    if (!page) return null;
    return {
      outcome: "full_text",
      content: page.content,
      title: page.title,
      fullTextSource: compactSource({ method: "oa_html", ...provenance, url: fetched.finalUrl }),
    };
  }

  logger.info("Open-access candidate unusable", { url: candidate.url, reason: fetched.reason });
  return null;
}

export async function ingestPaper(
  input: PaperIngestInput,
  deps: PaperIngestDeps,
  logger: IngestLogger
): Promise<PaperIngestResult> {
  const pr = input.paperRecord;
  const abstract = pr.abstract ?? "";

  // 1. A PDF already on the source.
  if (input.storageId) {
    const text = await ocrText(deps, input.storageId, logger);
    if (text) {
      return {
        outcome: "full_text",
        content: text,
        fullTextSource: input.fullTextSource ?? { method: "uploaded_pdf" },
      };
    }
  }

  // 2. Open-access candidates.
  const tried = new Set<string>();
  const started = deps.now();
  const candidates = await deps.resolveCandidates({
    doi: pr.doi,
    openAlexId: pr.openAlexId,
    pdfUrl: pr.pdfUrl,
  });
  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= MAX_CANDIDATE_ATTEMPTS || deps.now() - started >= CANDIDATE_BUDGET_MS) {
      logger.info("Stopped trying open-access candidates", {
        attempts,
        candidates: candidates.length,
      });
      break;
    }
    attempts++;
    tried.add(candidate.url);
    const result = await tryCandidate(candidate, abstract, deps, logger);
    if (result) {
      logger.info("Paper full text found", {
        method: result.fullTextSource.method,
        url: candidate.url,
        attempts,
      });
      return result;
    }
  }

  // 3. The landing page.
  const landing = input.fileUrl?.trim() || pr.landingPageUrl?.trim();
  if (landing && !tried.has(landing)) {
    const page = await fullTextPage(deps, landing, abstract, logger);
    if (page) {
      return {
        outcome: "full_text",
        content: page.content,
        title: page.title,
        fullTextSource: compactSource({
          method: "landing_page",
          url: landing,
          host: hostOf(landing),
        }),
      };
    }
  }

  // 4. Abstract only.
  logger.info("No full text found; storing the abstract", {
    attempts,
    candidates: candidates.length,
  });
  return { outcome: "abstract_only", content: buildPaperMetadataMarkdown(pr, input.title) };
}

export function fulltextStatusAfterIngest(
  outcome: PaperIngestResult["outcome"],
  previous: "available" | "unavailable" | "external_only" | undefined
): "available" | "unavailable" | "external_only" {
  if (outcome === "full_text") return "available";
  return previous === "external_only" ? "external_only" : "unavailable";
}
