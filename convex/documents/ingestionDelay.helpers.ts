// Shared by every path that schedules `documents/embeddingJob:docEmbedding`. The second dot in the
// file name keeps the Convex bundler from registering it as a function module.

/**
 * YouTube ingestion jobs start at a random point in this window, so several videos added at once
 * don't reach Supadata together and get "Limit Exceeded".
 */
export const YOUTUBE_INGESTION_STAGGER_MS = 8000;

/** How long to wait before a new source's ingestion job: a random stagger for YouTube, else 0. */
export function ingestionDelayMs(fileType: string, random: () => number = Math.random): number {
  return fileType === "youtube" ? Math.floor(random() * YOUTUBE_INGESTION_STAGGER_MS) : 0;
}
