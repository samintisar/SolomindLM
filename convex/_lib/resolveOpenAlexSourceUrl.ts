import { env } from "./env";

const USER_AGENT = "SolomindLM/1.0 (mailto:support@solomindlm.com)";

function isOffOpenAlexMetadataUrl(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host !== "openalex.org" && host !== "www.openalex.org";
  } catch {
    return false;
  }
}

/**
 * Picks a URL suitable for text extraction: OA PDF, OA page, then DOI / publisher landing.
 * Matches OpenAlexSearchService / Work object semantics.
 */
function pickArticleUrlFromOpenAlexWorkJson(work: Record<string, unknown> | null): string | null {
  if (!work) return null;

  const pl = work.primary_location as { pdf_url?: string; landing_page_url?: string } | undefined;
  const boa = work.best_oa_location as { pdf_url?: string; landing_page_url?: string } | undefined;
  const oa = work.open_access as { oa_url?: string } | undefined;
  const locations = (work.locations as { pdf_url?: string; landing_page_url?: string }[] | undefined) ?? [];

  const tryPush = (out: string[], v: unknown) => {
    if (typeof v === "string" && isOffOpenAlexMetadataUrl(v)) out.push(v);
  };

  const candidates: string[] = [];
  tryPush(candidates, boa?.pdf_url);
  tryPush(candidates, oa?.oa_url);
  for (const l of locations) {
    tryPush(candidates, l?.pdf_url);
  }
  tryPush(candidates, pl?.pdf_url);
  tryPush(candidates, boa?.landing_page_url);
  tryPush(candidates, pl?.landing_page_url);
  for (const l of locations) {
    tryPush(candidates, l?.landing_page_url);
  }
  tryPush(candidates, work.doi);
  tryPush(candidates, (work.ids as { doi?: string } | undefined)?.doi);

  return candidates[0] ?? null;
}

/**
 * If `fileUrl` is an OpenAlex **work** page (or api.openalex.org works JSON URL),
 * fetch the Work and return DOI / publisher / OA PDF URL for scraping. Otherwise
 * return the original string.
 */
export async function resolveOpenAlexSourceUrlToArticleUrl(fileUrl: string): Promise<string> {
  const trimmed = fileUrl.trim();
  if (!trimmed) return trimmed;

  let workId: string | null = null;
  try {
    const u = new URL(trimmed);
    const path = u.pathname;
    if (u.hostname === "openalex.org" || u.hostname === "www.openalex.org") {
      const m = path.match(/\/(W\d+)(?:\/|$)/i);
      if (m) workId = m[1].toUpperCase();
    } else if (u.hostname === "api.openalex.org") {
      const m = path.match(/\/works\/(W\d+)/i);
      if (m) workId = m[1].toUpperCase();
    }
  } catch {
    return trimmed;
  }
  if (!workId) return trimmed;

  const base = (env.OPENALEX_BASE_URL || "https://api.openalex.org").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/works/${workId}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return trimmed;
    const work = (await res.json()) as Record<string, unknown>;
    const resolved = pickArticleUrlFromOpenAlexWorkJson(work);
    return resolved ?? trimmed;
  } catch {
    return trimmed;
  }
}
