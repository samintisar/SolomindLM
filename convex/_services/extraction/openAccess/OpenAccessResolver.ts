/**
 * Finds legal open-access copies of a paper (#480): Unpaywall and OpenAlex locations by DOI (or
 * OpenAlex id), plus the arXiv PDF and PubMed Central article page those locations point to.
 * Returns candidates best-first: published version, then accepted manuscript, then preprint, then
 * unknown; PDF before HTML within a version. Never throws: a failed lookup gives no candidates.
 */

import { invokeWithHttpRetry } from "../../../_agents/_shared/retry";
import { env } from "../../../_lib/env";
import { ExternalServiceError } from "../../../_lib/errors";
import { createServiceLogger } from "../../../_lib/logging/serviceLogger";
import { type FullTextVersion, normalizeDoi } from "../../../documents/paperRecord";

export interface OaResolverInput {
  doi?: string;
  openAlexId?: string;
  pdfUrl?: string;
}

export interface OaCandidate {
  url: string;
  kind: "pdf" | "html";
  version?: FullTextVersion;
  license?: string;
  host: string;
}

/** One open-access location, from either API, in a common shape. */
export interface OaLocation {
  pdfUrl?: string | null;
  landingUrl?: string | null;
  version?: string | null;
  license?: string | null;
  pmhId?: string | null;
}

const LOOKUP_TIMEOUT_MS = 10_000;

const VERSION_RANK: Record<FullTextVersion, number> = {
  publishedVersion: 0,
  acceptedVersion: 1,
  submittedVersion: 2,
};

export function openAccessUserAgent(): string {
  return `SolomindLM/1.0 (mailto:${env.OPEN_ACCESS_CONTACT_EMAIL})`;
}

/** URL with the fragment removed (scheme kept: some repositories serve http only), or null for non-http(s). */
function cleanUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Comparison key: scheme, host case, trailing slash and fragment don't make a different copy. */
export function candidateKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return raw.trim().replace(/\/+$/, "");
  }
}

function asVersion(v: string | null | undefined): FullTextVersion | undefined {
  return v && Object.hasOwn(VERSION_RANK, v) ? (v as FullTextVersion) : undefined;
}

function arxivIdFromUrl(url: string | null | undefined): string | undefined {
  const m = url?.split(/[?#]/)[0].match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?$/i);
  return m?.[1];
}

function arxivIdFromPmh(pmhId: string | null | undefined): string | undefined {
  return pmhId?.match(/^oai:arXiv\.org:(.+)$/i)?.[1];
}

function pmcNumberFromUrl(url: string | null | undefined): string | undefined {
  return (
    url?.match(
      /(?:\/pmc\/articles\/|pmc\.ncbi\.nlm\.nih\.gov\/articles\/|europepmc\.org\/articles\/|europepmc\.org\/article\/PMC\/)(?:PMC)?(\d+)/i
    )?.[1] ?? url?.match(/europepmc\.org\/backend\/ptpmcrender\.fcgi\?(?:.*&)?accid=PMC(\d+)/i)?.[1]
  );
}

function pmcNumberFromPmh(pmhId: string | null | undefined): string | undefined {
  return pmhId?.match(/^oai:pubmedcentral\.nih\.gov:(\d+)$/i)?.[1];
}

const pmcArticleUrl = (n: string) => `https://pmc.ncbi.nlm.nih.gov/articles/PMC${n}/`;

/** Ordered, de-duplicated candidates from locations, PMC ids, and the record's own PDF link. */
export function candidatesFromLocations(
  locations: OaLocation[],
  pmcIds: string[],
  recordPdfUrl?: string
): OaCandidate[] {
  const byKey = new Map<string, OaCandidate>();

  const add = (raw: string, kind: OaCandidate["kind"], loc?: OaLocation) => {
    const url = cleanUrl(raw);
    if (!url) return;
    const key = candidateKey(url);
    const version = asVersion(loc?.version);
    const license = loc?.license?.trim() || undefined;
    const existing = byKey.get(key);
    if (existing) {
      if (url.startsWith("https:") && existing.url.startsWith("http:"))
        existing.url = existing.url.replace(/^http:/i, "https:");
      existing.version ??= version;
      existing.license ??= license;
      return;
    }
    byKey.set(key, { url, kind, version, license, host: new URL(url).hostname.toLowerCase() });
  };

  const addLocation = (loc: OaLocation) => {
    const arxivId =
      arxivIdFromUrl(loc.pdfUrl) ?? arxivIdFromUrl(loc.landingUrl) ?? arxivIdFromPmh(loc.pmhId);
    if (arxivId) {
      add(`https://arxiv.org/pdf/${arxivId}`, "pdf", loc);
      return;
    }
    const pmc =
      pmcNumberFromUrl(loc.pdfUrl) ??
      pmcNumberFromUrl(loc.landingUrl) ??
      pmcNumberFromPmh(loc.pmhId);
    if (pmc) {
      // PMC blocks server PDF downloads; its article page holds the full text.
      add(pmcArticleUrl(pmc), "html", loc);
      return;
    }
    if (loc.pdfUrl) add(loc.pdfUrl, "pdf", loc);
  };

  for (const loc of locations) addLocation(loc);
  for (const id of pmcIds) {
    const n = pmcNumberFromUrl(id) ?? id.match(/^(?:PMC)?(\d+)$/i)?.[1];
    if (n) add(pmcArticleUrl(n), "html");
  }
  if (recordPdfUrl) addLocation({ pdfUrl: recordPdfUrl });

  const rank = (c: OaCandidate) =>
    (c.version ? VERSION_RANK[c.version] : 3) * 2 + (c.kind === "pdf" ? 0 : 1);
  return [...byKey.values()]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** GET JSON with one retry on 429/5xx; 404 means "not known" and returns null. */
async function fetchJson<T>(url: string, service: string): Promise<T | null> {
  return invokeWithHttpRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": openAccessUserAgent() },
          signal: controller.signal,
        });
        if (res.status === 404) return null;
        if (!res.ok) {
          throw new ExternalServiceError(service, `${service} lookup failed: HTTP ${res.status}`, {
            statusCode: res.status,
            endpoint: url,
          });
        }
        return (await res.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    },
    `${service}_lookup`,
    { maxAttempts: 2, baseDelayMs: 250 }
  );
}

const encodeDoi = (doi: string) => doi.split("/").map(encodeURIComponent).join("/");

type UnpaywallResponse = {
  oa_locations?: Array<{
    url_for_pdf?: string | null;
    url_for_landing_page?: string | null;
    url?: string | null;
    version?: string | null;
    license?: string | null;
    pmh_id?: string | null;
  }>;
};

async function unpaywallLocations(doi: string): Promise<OaLocation[]> {
  const email = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const data = await fetchJson<UnpaywallResponse>(
    `https://api.unpaywall.org/v2/${encodeDoi(doi)}?email=${email}`,
    "unpaywall"
  );
  return (data?.oa_locations ?? []).map((l) => ({
    pdfUrl: l.url_for_pdf,
    landingUrl: l.url_for_landing_page ?? l.url,
    version: l.version,
    license: l.license,
    pmhId: l.pmh_id,
  }));
}

type OpenAlexWork = {
  ids?: { pmcid?: string | null };
  locations?: Array<{
    is_oa?: boolean;
    pdf_url?: string | null;
    landing_page_url?: string | null;
    version?: string | null;
    license?: string | null;
  }>;
};

async function openAlexLocations(
  doi: string | undefined,
  openAlexKey: string | undefined
): Promise<{ locations: OaLocation[]; pmcIds: string[] }> {
  const path = doi ? `doi:${encodeDoi(doi)}` : encodeURIComponent(openAlexKey ?? "");
  const mailto = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const data = await fetchJson<OpenAlexWork>(
    `https://api.openalex.org/works/${path}?select=ids,locations&mailto=${mailto}`,
    "openalex"
  );
  return {
    locations: (data?.locations ?? [])
      .filter((l) => l.is_oa !== false)
      .map((l) => ({
        pdfUrl: l.pdf_url,
        landingUrl: l.landing_page_url,
        version: l.version,
        license: l.license,
      })),
    pmcIds: data?.ids?.pmcid ? [data.ids.pmcid] : [],
  };
}

function openAlexKeyFrom(id: string | undefined): string | undefined {
  const key = id?.trim().replace(/^https?:\/\/openalex\.org\//i, "");
  return key || undefined;
}

export async function resolveOpenAccessCandidates(input: OaResolverInput): Promise<OaCandidate[]> {
  const logger = createServiceLogger("open_access", "resolve");
  const doi = normalizeDoi(input.doi);
  const openAlexKey = openAlexKeyFrom(input.openAlexId);

  const [unpaywall, openAlex] = await Promise.all([
    doi
      ? unpaywallLocations(doi).catch((error) => {
          logger.operationError(error, { api: "unpaywall", doi });
          return [] as OaLocation[];
        })
      : Promise.resolve([] as OaLocation[]),
    doi || openAlexKey
      ? openAlexLocations(doi, openAlexKey).catch((error) => {
          logger.operationError(error, { api: "openalex", doi, openAlexKey });
          return { locations: [] as OaLocation[], pmcIds: [] as string[] };
        })
      : Promise.resolve({ locations: [] as OaLocation[], pmcIds: [] as string[] }),
  ]);

  const candidates = candidatesFromLocations(
    [...unpaywall, ...openAlex.locations],
    openAlex.pmcIds,
    input.pdfUrl
  );
  logger.operationComplete({ doi, openAlexKey, candidates: candidates.length });
  return candidates;
}
