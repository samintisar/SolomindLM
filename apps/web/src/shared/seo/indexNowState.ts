import type { IndexNowUrlEntry } from "./indexNow";

/** What production last published: canonical URL → its sitemap `lastmod`. */
export type IndexNowPersistedState = {
  urls: Record<string, { lastmod: string }>;
};

export type IndexNowUrlDiff = {
  added: string[];
  updated: string[];
  removed: string[];
};

const SITEMAP_URL_PATTERN = /<url>([\s\S]*?)<\/url>/g;
const SITEMAP_LOC_PATTERN = /<loc>\s*([^<]+?)\s*<\/loc>/;
const SITEMAP_LASTMOD_PATTERN = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/;

/** Reads `<loc>` → `<lastmod>` pairs from a sitemap.xml body. */
export function parseSitemapState(xml: string): IndexNowPersistedState {
  const urls: IndexNowPersistedState["urls"] = {};
  for (const [, block] of xml.matchAll(SITEMAP_URL_PATTERN)) {
    const loc = SITEMAP_LOC_PATTERN.exec(block)?.[1];
    if (!loc) {
      continue;
    }
    urls[loc] = { lastmod: SITEMAP_LASTMOD_PATTERN.exec(block)?.[1] ?? "" };
  }
  return { urls };
}

/**
 * A page counts as updated only when its own registry `lastmod` changed. A page without one is
 * stamped with the build date in the sitemap, so comparing it would mark it changed on every build.
 */
export function diffIndexNowUrls(
  current: IndexNowUrlEntry[],
  previous: IndexNowPersistedState | null | undefined
): IndexNowUrlDiff {
  const previousUrls = previous?.urls ?? {};
  const currentByUrl = new Map(current.map((entry) => [entry.url, entry.lastmod]));

  const added: string[] = [];
  const updated: string[] = [];

  for (const [url, lastmod] of currentByUrl) {
    const prior = previousUrls[url];
    if (!prior) {
      added.push(url);
      continue;
    }
    if (lastmod !== undefined && prior.lastmod !== lastmod) {
      updated.push(url);
    }
  }

  const removed = Object.keys(previousUrls).filter((url) => !currentByUrl.has(url));

  return { added, updated, removed };
}

export function collectChangedCanonicalUrls(diff: IndexNowUrlDiff): string[] {
  return [...new Set([...diff.added, ...diff.updated, ...diff.removed])];
}

/**
 * URLs to submit for this deploy. With no published sitemap to compare against, submit nothing:
 * resubmitting every page is what IndexNow asks sites not to do.
 */
export function selectChangedIndexNowUrls(
  current: IndexNowUrlEntry[],
  published: IndexNowPersistedState | null
): string[] {
  if (!published) {
    return [];
  }
  return collectChangedCanonicalUrls(diffIndexNowUrls(current, published));
}
