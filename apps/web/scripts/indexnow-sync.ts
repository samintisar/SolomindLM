#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeIndexNowStatus,
  getIndexNowKeyLocation,
  getPublicSeoCanonicalUrlEntries,
  isValidIndexNowKey,
  submitIndexNowBatches,
} from "../src/shared/seo/indexNow.ts";
import {
  collectChangedCanonicalUrls,
  diffIndexNowUrls,
  entriesToState,
  type IndexNowPersistedState,
} from "../src/shared/seo/indexNowState.ts";
import {
  drainIndexNowQueue,
  mergeIndexNowQueue,
  type IndexNowQueueFile,
} from "../src/shared/seo/indexNowQueue.ts";
import { SEO_BASE_URL } from "../src/shared/seo/seoConstants.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../dist");
const statePath = path.resolve(scriptDir, "indexnow-state.json");
const queuePath = path.resolve(scriptDir, ".indexnow-queue.json");
const buildDate = new Date().toISOString().slice(0, 10);

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function shouldSubmitToIndexNow(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.INDEXNOW_SUBMIT === "true";
}

function writeKeyVerificationFile(key: string): void {
  const keyFileName = `${key}.txt`;
  const keyContents = `${key}\n`;

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, keyFileName), keyContents, "utf-8");

  console.log(
    `[indexnow-sync] Wrote key file to dist/${keyFileName} (${getIndexNowKeyLocation(key, SEO_BASE_URL)})`
  );
}

function loadState(): IndexNowPersistedState | null {
  return readJsonFile<IndexNowPersistedState>(statePath);
}

function loadQueue(): IndexNowQueueFile | null {
  return readJsonFile<IndexNowQueueFile>(queuePath);
}

function saveQueue(queue: IndexNowQueueFile): void {
  if (queue.urls.length === 0) {
    if (fs.existsSync(queuePath)) {
      fs.unlinkSync(queuePath);
    }
    return;
  }
  writeJsonFile(queuePath, queue);
}

async function flushQueue(key: string, queue: IndexNowQueueFile): Promise<IndexNowQueueFile> {
  const { queue: drainedQueue, urls } = drainIndexNowQueue(queue);
  if (!urls.length) {
    return drainedQueue;
  }

  const results = await submitIndexNowBatches(urls, { key });
  for (const result of results) {
    if (result.urlCount === 0) {
      continue;
    }
    const summary = describeIndexNowStatus(result.status);
    const level = result.status === 200 || result.status === 202 ? "log" : "error";
    const message = `[indexnow-sync] IndexNow ${result.status} ${result.statusText} (${result.urlCount} URLs) — ${summary}`;
    if (level === "error") {
      console.error(message);
    } else {
      console.log(message);
    }
  }

  const failed = results.some(
    (result) => result.urlCount > 0 && result.status !== 200 && result.status !== 202
  );
  if (failed) {
    const retryQueue = mergeIndexNowQueue(drainedQueue, urls);
    saveQueue(retryQueue);
    throw new Error("IndexNow submission failed; URLs re-queued for retry");
  }

  return drainedQueue;
}

async function main(): Promise<void> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log("[indexnow-sync] Skipped (INDEXNOW_KEY is not set)");
    return;
  }

  if (!isValidIndexNowKey(key)) {
    throw new Error("INDEXNOW_KEY must be 8–128 characters of letters, numbers, and dashes");
  }

  writeKeyVerificationFile(key);

  const currentEntries = getPublicSeoCanonicalUrlEntries(buildDate);
  const previousState = loadState();
  const diff = diffIndexNowUrls(currentEntries, previousState);
  const changedUrls = collectChangedCanonicalUrls(diff);

  let queue = loadQueue() ?? { urls: [] };
  if (changedUrls.length > 0) {
    queue = mergeIndexNowQueue(queue, changedUrls);
    console.log(
      `[indexnow-sync] Enqueued ${changedUrls.length} changed URL(s) (added=${diff.added.length}, updated=${diff.updated.length}, removed=${diff.removed.length})`
    );
  } else {
    console.log("[indexnow-sync] No public SEO URL changes detected");
  }

  writeJsonFile(statePath, entriesToState(currentEntries));

  if (!shouldSubmitToIndexNow()) {
    saveQueue(queue);
    console.log(
      "[indexnow-sync] Skipped submission (set VERCEL_ENV=production or INDEXNOW_SUBMIT=true to flush)"
    );
    return;
  }

  if (queue.urls.length === 0) {
    console.log("[indexnow-sync] Queue empty; nothing to submit");
    return;
  }

  queue = await flushQueue(key, queue);
  saveQueue(queue);
  console.log("[indexnow-sync] Queue flushed");
}

main().catch((error: unknown) => {
  console.error("[indexnow-sync] Failed:", error);
  process.exit(1);
});
