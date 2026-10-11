export type IndexNowUrlEntry = {
  url: string;
  /** The page's own date; absent when the sitemap has no `<lastmod>` for it. */
  lastmod: string | undefined;
};

/** One deployment's sitemap: canonical URL → its `<lastmod>` ("" when absent). */
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
 * The `<urlset>` root element when it is the whole document apart from an XML declaration and
 * comments, else null. Returning the bare root keeps `<url>` text inside those comments out of the
 * scan. A plain scan rather than one anchored regex, which backtracks badly on repeated comments.
 */
function extractUrlsetRoot(xml: string): string | null {
  let body = xml.trim();
  if (body.startsWith("<?xml")) {
    const end = body.indexOf("?>");
    if (end === -1) {
      return null;
    }
    body = body.slice(end + 2).trimStart();
  }
  while (body.startsWith("<!--")) {
    const end = body.indexOf("-->");
    if (end === -1) {
      return null;
    }
    body = body.slice(end + 3).trimStart();
  }
  while (body.endsWith("-->")) {
    const start = body.lastIndexOf("<!--");
    if (start === -1) {
      return null;
    }
    body = body.slice(0, start).trimEnd();
  }
  const afterName = body.charAt("<urlset".length);
  const isRoot =
    body.startsWith("<urlset") &&
    (afterName === ">" || /\s/.test(afterName)) &&
    body.endsWith("</urlset>");
  return isRoot ? body : null;
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
  const root = extractUrlsetRoot(xml);
  if (root === null) {
    return null;
  }
  const blocks = readUrlBlocks(root);
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

/** URLs to submit after a deploy: what changed between the previous and new deployment's sitemaps. */
export function changedSitemapUrls(
  previous: IndexNowPersistedState,
  current: IndexNowPersistedState
): string[] {
  const entries = Object.entries(current.urls).map(([url, { lastmod }]) => ({
    url,
    lastmod: lastmod || undefined,
  }));
  return collectChangedCanonicalUrls(diffIndexNowUrls(entries, previous));
}
