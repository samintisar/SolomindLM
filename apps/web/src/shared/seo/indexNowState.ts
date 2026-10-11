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

const SITEMAP_LOC_PATTERN = /<loc>\s*([^<]+?)\s*<\/loc>/;
const SITEMAP_LASTMOD_PATTERN = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/;

/**
 * True when the body is one `<urlset>` root with only an XML declaration or comments around it.
 * A plain scan rather than one anchored regex, which backtracks badly on repeated comments.
 */
function isWholeUrlsetDocument(xml: string): boolean {
  let body = xml.trim();
  if (body.startsWith("<?xml")) {
    const end = body.indexOf("?>");
    if (end === -1) {
      return false;
    }
    body = body.slice(end + 2).trimStart();
  }
  while (body.startsWith("<!--")) {
    const end = body.indexOf("-->");
    if (end === -1) {
      return false;
    }
    body = body.slice(end + 3).trimStart();
  }
  while (body.endsWith("-->")) {
    const start = body.lastIndexOf("<!--");
    if (start === -1) {
      return false;
    }
    body = body.slice(0, start).trimEnd();
  }
  const afterName = body.charAt("<urlset".length);
  return (
    body.startsWith("<urlset") &&
    (afterName === ">" || /\s/.test(afterName)) &&
    body.endsWith("</urlset>")
  );
}

/** The body of each `<url>` block, or null if one is never closed. Linear indexOf scan. */
function readUrlBlocks(xml: string): string[] | null {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const open = xml.indexOf("<url>", from);
    if (open === -1) {
      return blocks;
    }
    const start = open + "<url>".length;
    const close = xml.indexOf("</url>", start);
    if (close === -1) {
      return null;
    }
    const block = xml.slice(start, close);
    if (block.includes("<url>")) {
      return null;
    }
    blocks.push(block);
    from = close + "</url>".length;
  }
}

/**
 * Reads `<loc>` → `<lastmod>` pairs from a sitemap.xml body. Returns null for anything that is not
 * a complete `<urlset>` (an HTML error page, a truncated body), so the caller can't mistake it for
 * an empty sitemap and treat every page as new.
 */
export function parseSitemapState(xml: string): IndexNowPersistedState | null {
  if (!isWholeUrlsetDocument(xml)) {
    return null;
  }
  const blocks = readUrlBlocks(xml);
  if (!blocks) {
    return null;
  }

  const urls: IndexNowPersistedState["urls"] = {};
  for (const block of blocks) {
    const loc = SITEMAP_LOC_PATTERN.exec(block)?.[1];
    if (!loc) {
      return null;
    }
    urls[loc] = { lastmod: SITEMAP_LASTMOD_PATTERN.exec(block)?.[1] ?? "" };
  }
  return { urls };
}

/**
 * A page counts as updated only when its own registry `lastmod` changed. A page without one has no
 * date to compare, so it is only submitted when it is added or removed.
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

/** URLs to submit for this deploy: what changed since the published sitemap. */
export function selectChangedIndexNowUrls(
  current: IndexNowUrlEntry[],
  published: IndexNowPersistedState
): string[] {
  return collectChangedCanonicalUrls(diffIndexNowUrls(current, published));
}
