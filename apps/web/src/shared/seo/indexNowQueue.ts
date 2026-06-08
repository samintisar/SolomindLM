export type IndexNowQueueFile = {
  urls: string[];
};

export function dedupeIndexNowUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

export function mergeIndexNowQueue(
  queue: IndexNowQueueFile | null | undefined,
  urls: string[]
): IndexNowQueueFile {
  const existing = queue?.urls ?? [];
  return { urls: dedupeIndexNowUrls([...existing, ...urls]) };
}

export function drainIndexNowQueue(queue: IndexNowQueueFile | null | undefined): {
  queue: IndexNowQueueFile;
  urls: string[];
} {
  const urls = dedupeIndexNowUrls(queue?.urls ?? []);
  return { queue: { urls: [] }, urls };
}
