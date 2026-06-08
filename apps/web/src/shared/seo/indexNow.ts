import { getIndexablePublicSeoPages } from "./publicSeoPages";
import { SEO_BASE_URL } from "./seoConstants";
import { canonicalUrl } from "./seoHtml";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS_PER_REQUEST = 10_000;

const INDEXNOW_KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;

export type IndexNowUrlEntry = {
  url: string;
  lastmod: string;
};

export type IndexNowSubmitResult = {
  status: number;
  statusText: string;
  urlCount: number;
};

export type IndexNowSubmitOptions = {
  key: string;
  host?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function isValidIndexNowKey(key: string): boolean {
  return INDEXNOW_KEY_PATTERN.test(key);
}

export function getIndexNowHost(baseUrl: string = SEO_BASE_URL): string {
  return new URL(baseUrl).host;
}

export function getIndexNowKeyLocation(key: string, baseUrl: string = SEO_BASE_URL): string {
  return `${baseUrl}/${key}.txt`;
}

/** Canonical public SEO URLs — same source as sitemap and prerender. */
export function getPublicSeoCanonicalUrlEntries(buildDate?: string): IndexNowUrlEntry[] {
  const resolvedBuildDate = buildDate ?? new Date().toISOString().slice(0, 10);
  return getIndexablePublicSeoPages().map((page) => ({
    url: canonicalUrl(SEO_BASE_URL, page.path),
    lastmod: page.lastmod ?? resolvedBuildDate,
  }));
}

export function filterIndexableUrls(
  urls: string[],
  host: string = getIndexNowHost()
): string[] {
  return [...new Set(urls)].filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.host === host;
    } catch {
      return false;
    }
  });
}

export function describeIndexNowStatus(status: number): string {
  switch (status) {
    case 200:
      return "received";
    case 202:
      return "received (key validation pending)";
    case 403:
      return "forbidden (check key and key file)";
    case 422:
      return "unprocessable (host/URL mismatch)";
    case 429:
      return "too many requests";
    default:
      return "unexpected response";
  }
}

export async function submitIndexNow(
  urls: string[],
  options: IndexNowSubmitOptions
): Promise<IndexNowSubmitResult> {
  const baseUrl = options.baseUrl ?? SEO_BASE_URL;
  const host = options.host ?? getIndexNowHost(baseUrl);
  const keyLocation = getIndexNowKeyLocation(options.key, baseUrl);
  const uniqueUrls = filterIndexableUrls(urls, host).slice(0, INDEXNOW_MAX_URLS_PER_REQUEST);

  if (!uniqueUrls.length) {
    return { status: 0, statusText: "skipped (no valid URLs)", urlCount: 0 };
  }

  if (!isValidIndexNowKey(options.key)) {
    throw new Error("IndexNow key must be 8–128 characters of letters, numbers, and dashes");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: options.key,
      keyLocation,
      urlList: uniqueUrls,
    }),
  });

  return {
    status: response.status,
    statusText: response.statusText,
    urlCount: uniqueUrls.length,
  };
}

export async function submitIndexNowBatches(
  urls: string[],
  options: IndexNowSubmitOptions
): Promise<IndexNowSubmitResult[]> {
  const host = options.host ?? getIndexNowHost(options.baseUrl);
  const uniqueUrls = filterIndexableUrls(urls, host);
  const results: IndexNowSubmitResult[] = [];

  for (let offset = 0; offset < uniqueUrls.length; offset += INDEXNOW_MAX_URLS_PER_REQUEST) {
    const batch = uniqueUrls.slice(offset, offset + INDEXNOW_MAX_URLS_PER_REQUEST);
    results.push(await submitIndexNow(batch, options));
  }

  return results;
}
