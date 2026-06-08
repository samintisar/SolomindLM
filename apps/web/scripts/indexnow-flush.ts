#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeIndexNowStatus,
  isValidIndexNowKey,
  submitIndexNowBatches,
} from "../src/shared/seo/indexNow.ts";
import {
  drainIndexNowQueue,
  type IndexNowQueueFile,
} from "../src/shared/seo/indexNowQueue.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const queuePath = path.resolve(scriptDir, ".indexnow-queue.json");

function readQueue(): IndexNowQueueFile {
  if (!fs.existsSync(queuePath)) {
    return { urls: [] };
  }
  return JSON.parse(fs.readFileSync(queuePath, "utf-8")) as IndexNowQueueFile;
}

function saveQueue(queue: IndexNowQueueFile): void {
  if (queue.urls.length === 0) {
    if (fs.existsSync(queuePath)) {
      fs.unlinkSync(queuePath);
    }
    return;
  }
  fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    throw new Error("INDEXNOW_KEY is required");
  }
  if (!isValidIndexNowKey(key)) {
    throw new Error("INDEXNOW_KEY must be 8–128 characters of letters, numbers, and dashes");
  }

  const queue = readQueue();
  const { queue: drainedQueue, urls } = drainIndexNowQueue(queue);

  if (!urls.length) {
    console.log("[indexnow-flush] Queue empty; nothing to submit");
    return;
  }

  const results = await submitIndexNowBatches(urls, { key });
  for (const result of results) {
    if (result.urlCount === 0) {
      continue;
    }
    console.log(
      `[indexnow-flush] IndexNow ${result.status} ${result.statusText} (${result.urlCount} URLs) — ${describeIndexNowStatus(result.status)}`
    );
  }

  const failed = results.some(
    (result) => result.urlCount > 0 && result.status !== 200 && result.status !== 202
  );
  if (failed) {
    const retryQueue = { urls: [...new Set([...drainedQueue.urls, ...urls])] };
    saveQueue(retryQueue);
    throw new Error("IndexNow submission failed; URLs re-queued for retry");
  }

  saveQueue(drainedQueue);
  console.log(`[indexnow-flush] Submitted ${urls.length} URL(s)`);
}

main().catch((error: unknown) => {
  console.error("[indexnow-flush] Failed:", error);
  process.exit(1);
});
