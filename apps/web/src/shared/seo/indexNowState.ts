import type { IndexNowUrlEntry } from "./indexNow";

export type IndexNowPersistedState = {
  urls: Record<string, { lastmod: string }>;
};

export type IndexNowUrlDiff = {
  added: string[];
  updated: string[];
  removed: string[];
};

export function entriesToState(entries: IndexNowUrlEntry[]): IndexNowPersistedState {
  return {
    urls: Object.fromEntries(entries.map((entry) => [entry.url, { lastmod: entry.lastmod }])),
  };
}

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
    if (prior.lastmod !== lastmod) {
      updated.push(url);
    }
  }

  const removed = Object.keys(previousUrls).filter((url) => !currentByUrl.has(url));

  return { added, updated, removed };
}

export function collectChangedCanonicalUrls(diff: IndexNowUrlDiff): string[] {
  return [...new Set([...diff.added, ...diff.updated, ...diff.removed])];
}
