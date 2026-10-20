/**
 * Wikipedia articles are read through the MediaWiki Action API (TextExtracts) instead of being
 * scraped. A scrape returns the whole page — navboxes, sidebars, link lists and references were a
 * quarter to half of each article's text — and that junk reached chunks, chat and Studio output.
 * The API returns the article prose with its section headings only. Free, no key; Wikimedia asks
 * for a descriptive User-Agent with a contact.
 */

const WIKIPEDIA_HOST_REGEX = /^([a-z][a-z0-9-]*)\.(?:m\.)?wikipedia\.org$/i;

/** Sections that hold links, citations or reading lists rather than article prose. */
const NON_PROSE_SECTIONS = new Set([
  "see also",
  "references",
  "notes",
  "notes and references",
  "footnotes",
  "citations",
  "sources",
  "bibliography",
  "further reading",
  "external links",
  "works cited",
]);

const REQUEST_TIMEOUT_MS = 20_000;
/** Longest Retry-After we wait for once before falling back to the scraper. */
const MAX_RETRY_AFTER_MS = 5_000;

export interface WikipediaArticleRef {
  /** e.g. https://de.wikipedia.org — keeps the article's language. */
  origin: string;
  title: string;
}

/**
 * The article a link points to, or undefined when the link is not a plain Wikipedia article.
 * Revision permalinks (`oldid`) and diffs are left to the scraper so the user gets that revision.
 */
export function wikipediaArticleForLink(link: string): WikipediaArticleRef | undefined {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(url.protocol)) return undefined;
  const host = url.hostname.match(WIKIPEDIA_HOST_REGEX);
  if (!host) return undefined;
  if (url.searchParams.has("oldid") || url.searchParams.has("diff")) return undefined;

  let rawTitle: string | null = null;
  if (url.pathname.startsWith("/wiki/")) {
    rawTitle = url.pathname.slice("/wiki/".length);
  } else if (url.pathname === "/w/index.php") {
    rawTitle = url.searchParams.get("title");
  }
  if (!rawTitle) return undefined;

  let title: string;
  try {
    title = decodeURIComponent(rawTitle);
  } catch {
    return undefined;
  }
  title = title.replace(/_/g, " ").trim();
  if (!title) return undefined;
  return { origin: `https://${host[1].toLowerCase()}.wikipedia.org`, title };
}

/**
 * Markdown from a TextExtracts plain-text extract: `== Heading ==` lines become Markdown headings,
 * link and reference sections are dropped, and math (MathML tokens, one per line, followed by a
 * `{\displaystyle …}` or `{\textstyle …}` line) becomes inline `$…$` LaTeX.
 */
export function wikipediaExtractToMarkdown(extract: string): string {
  const lines = collapseMath(extract.replace(/⁠/g, "").split("\n"));
  const out: string[] = [];
  let skipLevel: number | null = null;
  for (const line of lines) {
    const heading = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (heading) {
      const level = heading[1].length;
      if (skipLevel !== null && level > skipLevel) continue;
      skipLevel = NON_PROSE_SECTIONS.has(heading[2].toLowerCase()) ? level : null;
      if (skipLevel === null) out.push("", `${"#".repeat(level)} ${heading[2]}`, "");
      continue;
    }
    if (skipLevel === null) out.push(line);
  }
  return out
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The TeX annotation that ends a rendered formula: display (`\displaystyle`) or inline (`\textstyle`). */
const DISPLAYSTYLE_REGEX = /^\s*\{\\(?:displaystyle|textstyle)\s*(.*)\}\s*$/;
/**
 * A line of a rendered formula: indented by two or more spaces, or whitespace only. Prose that
 * resumes after a formula is indented by at most one space (" and computes…"), and paragraph
 * breaks are truly empty lines, so neither is swallowed.
 */
const MATH_TOKEN_LINE = /^(?:[ \t]{2,}|[ \t]+$)/;

/**
 * TextExtracts renders each formula as an indented run of MathML token lines ending in a
 * `{\displaystyle LATEX}` line. Replace each run with `$LATEX$`, joined to the surrounding prose.
 */
function collapseMath(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!MATH_TOKEN_LINE.test(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && MATH_TOKEN_LINE.test(lines[end])) end++;
    const formulas = lines
      .slice(i, end)
      .map((l) => l.match(DISPLAYSTYLE_REGEX)?.[1]?.trim())
      .filter((f): f is string => !!f);
    if (formulas.length === 0) {
      out.push(...lines.slice(i, end));
      i = end;
      continue;
    }
    const math = formulas.map((f) => `$${f}$`).join(" ");
    const before = out.length > 0 ? (out.pop() as string) : "";
    const after = end < lines.length ? lines[end] : "";
    out.push(joinInline(joinInline(before, math), after));
    i = end + 1;
  }
  return out;
}

function joinInline(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const separator = /^\s*[,.;:)!?]/.test(right) ? "" : " ";
  return `${left.trimEnd()}${separator}${right.trimStart()}`;
}

export interface WikipediaArticle {
  title: string;
  content: string;
}

export interface FetchWikipediaOptions {
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The article's prose as Markdown, or undefined when the link isn't a Wikipedia article or the
 * API gives nothing usable (missing page, error, empty text) — callers fall back to the scraper.
 */
export async function readWikipediaArticle(
  link: string,
  options: FetchWikipediaOptions
): Promise<WikipediaArticle | undefined> {
  const ref = wikipediaArticleForLink(link);
  if (!ref) return undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "wiki",
    redirects: "1",
    format: "json",
    formatversion: "2",
    titles: ref.title,
  });
  const apiUrl = `${ref.origin}/w/api.php?${params}`;
  const request = () =>
    fetchImpl(apiUrl, {
      headers: { "User-Agent": options.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  try {
    let response = await request();
    if (response.status === 429) {
      const retryAfterMs = Number(response.headers.get("retry-after") ?? "1") * 1000;
      if (!(retryAfterMs <= MAX_RETRY_AFTER_MS)) return undefined;
      await sleep(retryAfterMs);
      response = await request();
    }
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      query?: { pages?: Array<{ title?: string; extract?: string; missing?: boolean }> };
    };
    const page = body.query?.pages?.[0];
    if (!page || page.missing || !page.extract) return undefined;
    const content = wikipediaExtractToMarkdown(page.extract);
    if (!content) return undefined;
    return { title: page.title ?? ref.title, content };
  } catch {
    return undefined;
  }
}
