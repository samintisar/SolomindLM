/**
 * How a paper source gets its text (#480). Stops at the first step that yields full text:
 *   1. a PDF already stored on the source (uploaded, or found by an earlier import), OCR'd;
 *   2. open-access candidates, best version first: PDFs are stored and OCR'd, HTML pages scraped;
 *   3. the landing page, scraped;
 *   4. otherwise the title + abstract stub, marked abstract only.
 * Under `fullTextPolicy: "open_license_only"` only openly licensed copies count (steps 1–2) and
 * step 3 is skipped.
 * Scraped text must pass `isFullTextLength`. All I/O comes in through `deps`, so this is unit-tested
 * without Convex; `embeddingJob` supplies the real storage, OCR and scraper.
 *
 * A transient OCR failure (5xx, 429, network, timeout) propagates, on the stored PDF or an open-access
 * one: the caller marks the source failed and the user can retry. A permanent failure (a corrupt PDF,
 * a missing file) or empty text lets the ladder carry on, so a working open-access PDF can replace the
 * unreadable file. The replaced PDF is only deleted once the ingest has succeeded (`embeddingJob`). Steps 1-3 share one deadline (`INGEST_DEADLINE_MS`) so the caller keeps enough of
 * Convex's 600 s action limit to chunk and embed the result.
 */

import { isHttpAwareRetryableError } from "../_agents/_shared/retry";
import { ExternalServiceError } from "../_lib/errors";
import type { FetchedCandidate } from "../_services/extraction/openAccess/fetchOaCandidate";
import {
  isFullTextLength,
  isPlausiblePdfText,
} from "../_services/extraction/openAccess/fullTextTest";
import {
  candidateKey,
  type OaCandidate,
  type OaResolverInput,
} from "../_services/extraction/openAccess/OpenAccessResolver";
import { buildPaperMetadataMarkdown, type FullTextSource, type PaperRecord } from "./paperRecord";

export const MAX_CANDIDATE_ATTEMPTS = 6;
/** Steps 1-3 must finish this long after `ingestPaper` starts; chunking and embedding get the rest of 600 s. */
export const INGEST_DEADLINE_MS = 420_000;
/** Worst case for a PDF candidate: 30 s fetch + Mistral OCR with retries (about 3 x 60 s + backoff). */
export const PDF_ATTEMPT_RESERVE_MS = 220_000;
/** Worst case for an HTML candidate: 30 s fetch + a Supadata scrape (`SCRAPE_BUDGET_MS`, 55 s). */
export const HTML_ATTEMPT_RESERVE_MS = 90_000;
/** Time needed to store and OCR a PDF once it has been downloaded (the fetch is already spent). */
const PDF_OCR_RESERVE_MS = 190_000;
/** Time needed for the landing-page scrape (`SCRAPE_BUDGET_MS`, 55 s). */
const LANDING_RESERVE_MS = 60_000;

const OPEN_LICENSE_IDS = new Set(["cc-by", "cc-by-sa", "cc0", "public-domain", "pd"]);

/**
 * True for licences that allow anyone to redistribute the full text, commercially included:
 * CC BY, CC BY-SA, CC0 and public domain. Accepts Unpaywall/OpenAlex ids ("cc-by"), labels
 * ("CC BY 4.0") and creativecommons.org URLs (Crossref). NC/ND variants and publisher
 * licences are not open.
 */
export function isOpenFullTextLicense(license: string | undefined): boolean {
  const raw = license?.trim().toLowerCase();
  if (!raw) return false;
  const url = raw.match(/creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)/);
  if (url) {
    return url[1] === "publicdomain"
      ? url[2] === "zero" || url[2] === "mark"
      : url[2] === "by" || url[2] === "by-sa";
  }
  const id = raw.replace(/[\s_]+/g, "-").replace(/-\d+(\.\d+)*$/, "");
  return OPEN_LICENSE_IDS.has(id);
}

export interface PaperIngestInput {
  title: string;
  paperRecord: PaperRecord;
  fileUrl?: string;
  storageId?: string;
  fullTextSource?: FullTextSource;
  /**
   * "open_license_only": keep full text only from an open-access copy under an open licence
   * (`isOpenFullTextLicense`); never the landing page, and a stored PDF only when its recorded
   * licence is open. Set on sources that get published (the showcase seed).
   */
  fullTextPolicy?: "open_license_only";
}

export interface PaperIngestDeps {
  resolveCandidates(input: OaResolverInput): Promise<OaCandidate[]>;
  fetchCandidate(url: string): Promise<FetchedCandidate>;
  /** Stores PDF bytes and points the document at them, returns the storage id. Deletes nothing. */
  attachPdf(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
  /** Deletes a PDF stored by `attachPdf` and points the document back at the PDF it had before. */
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

/**
 * OCR failures worth retrying later: HTTP 429/5xx, network errors and timeouts, and 402 (the OCR
 * account's spending limit is reached). Falling through would store the paper as abstract only for
 * good, as though no full text existed (#591).
 */
function isTransientOcrError(error: Error): boolean {
  return (
    isHttpAwareRetryableError(error) ||
    (error instanceof ExternalServiceError && error.statusCode === 402) ||
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    /\btim(?:ed|e)[ -]?out\b/i.test(error.message)
  );
}

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

/** OCR text, or null for a permanent failure or no text. Throws a transient failure. */
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
    const error = e instanceof Error ? e : new Error(String(e));
    if (isTransientOcrError(error)) throw error;
    logger.warn("PDF OCR failed", { storageId, error: error.message });
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

interface AttemptContext {
  abstract: string;
  deps: PaperIngestDeps;
  logger: IngestLogger;
  /** `candidateKey`s of every page already looked at, including where redirects ended up. */
  tried: Set<string>;
  deadline: number;
}

async function tryCandidate(
  candidate: OaCandidate,
  ctx: AttemptContext
): Promise<FullTextResult | null> {
  const { abstract, deps, logger, tried } = ctx;
  let fetched: FetchedCandidate;
  try {
    fetched = await deps.fetchCandidate(candidate.url);
  } catch (e) {
    logger.warn("Fetching open-access candidate failed", {
      url: candidate.url,
      error: errorMessage(e),
    });
    return null;
  }
  if (fetched.type !== "unusable") tried.add(candidateKey(fetched.finalUrl));

  if (fetched.type === "pdf") {
    if (deps.now() + PDF_OCR_RESERVE_MS > ctx.deadline) {
      logger.info("Skipping a fetched PDF; too little time left to OCR it", { url: candidate.url });
      return null;
    }
    let storageId: string;
    try {
      storageId = await deps.attachPdf(fetched.bytes);
    } catch (e) {
      logger.warn("Storing open-access PDF failed", { url: candidate.url, error: errorMessage(e) });
      return null;
    }
    let text: string | null = null;
    let transientError: unknown;
    try {
      text = await ocrText(deps, storageId, logger);
    } catch (e) {
      transientError = e;
    }
    if (text && !isPlausiblePdfText(text, abstract)) {
      logger.info("Open-access PDF is too short to be the paper", {
        url: candidate.url,
        contentLength: text.length,
      });
      text = null;
    }
    if (text) {
      return {
        outcome: "full_text",
        content: text,
        fullTextSource: compactSource({
          method: "oa_pdf",
          url: candidate.url,
          version: candidate.version,
          license: candidate.license,
          host: candidate.host,
        }),
      };
    }
    await deps
      .detachPdf(storageId)
      .catch((e) =>
        logger.warn("Deleting unreadable PDF failed", { storageId, error: errorMessage(e) })
      );
    if (transientError !== undefined) throw transientError;
    return null;
  }

  if (fetched.type === "html") {
    const page = await fullTextPage(deps, fetched.finalUrl, abstract, logger);
    if (!page) return null;
    return {
      outcome: "full_text",
      content: page.content,
      title: page.title,
      fullTextSource: compactSource({
        method: "oa_html",
        url: fetched.finalUrl,
        version: candidate.version,
        license: candidate.license,
        host: hostOf(fetched.finalUrl) ?? candidate.host,
      }),
    };
  }

  logger.info("Open-access candidate unusable", { url: candidate.url, reason: fetched.reason });
  return null;
}

async function resolveCandidatesSafely(
  pr: PaperRecord,
  deps: PaperIngestDeps,
  logger: IngestLogger
): Promise<OaCandidate[]> {
  try {
    return await deps.resolveCandidates({
      doi: pr.doi,
      openAlexId: pr.openAlexId,
      pdfUrl: pr.pdfUrl,
    });
  } catch (e) {
    logger.warn("Open-access lookup failed", { error: errorMessage(e) });
    return [];
  }
}

export async function ingestPaper(
  input: PaperIngestInput,
  deps: PaperIngestDeps,
  logger: IngestLogger
): Promise<PaperIngestResult> {
  const pr = input.paperRecord;
  const abstract = pr.abstract ?? "";
  const deadline = deps.now() + INGEST_DEADLINE_MS;
  const openOnly = input.fullTextPolicy === "open_license_only";

  // 1. A PDF already on the source. A transient OCR failure throws so the caller can retry.
  if (input.storageId && (!openOnly || isOpenFullTextLicense(input.fullTextSource?.license))) {
    let text = "";
    try {
      text = (await deps.ocrStoredPdf(input.storageId)).trim();
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      if (isTransientOcrError(error)) throw error;
      logger.warn("Stored PDF OCR failed permanently; trying other routes", {
        storageId: input.storageId,
        error: error.message,
      });
    }
    if (text) {
      const recorded = input.fullTextSource;
      return {
        outcome: "full_text",
        content: text,
        fullTextSource:
          recorded && (recorded.method === "oa_pdf" || recorded.method === "uploaded_pdf")
            ? recorded
            : { method: "uploaded_pdf" },
      };
    }
    logger.warn("Stored PDF gave no text; trying other routes", { storageId: input.storageId });
  }

  // 2. Open-access candidates.
  const ctx: AttemptContext = { abstract, deps, logger, tried: new Set(), deadline };
  const candidates = (await resolveCandidatesSafely(pr, deps, logger)).filter(
    (candidate) => !openOnly || isOpenFullTextLicense(candidate.license)
  );
  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= MAX_CANDIDATE_ATTEMPTS) break;
    const remaining = deadline - deps.now();
    if (remaining < HTML_ATTEMPT_RESERVE_MS) {
      logger.info("Out of time for open-access candidates", { attempts });
      break;
    }
    if (candidate.kind === "pdf" && remaining < PDF_ATTEMPT_RESERVE_MS) {
      continue;
    }
    attempts++;
    ctx.tried.add(candidateKey(candidate.url));
    const result = await tryCandidate(candidate, ctx);
    if (result) {
      logger.info("Paper full text found", {
        method: result.fullTextSource.method,
        url: candidate.url,
        attempts,
      });
      return result;
    }
  }

  // 3. The landing page (never under the open-licence policy: a publisher page has no licence).
  const landing = input.fileUrl?.trim() || pr.landingPageUrl?.trim();
  if (!openOnly && landing && !ctx.tried.has(candidateKey(landing))) {
    if (deadline - deps.now() < LANDING_RESERVE_MS) {
      logger.info("Out of time for the landing page", { landing });
    } else {
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
