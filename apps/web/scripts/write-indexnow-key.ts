#!/usr/bin/env bun

/**
 * Writes dist/{INDEXNOW_KEY}.txt so IndexNow can verify the host. Submitting URLs happens after
 * the deploy is live, in .github/workflows/indexnow.yml (scripts/indexnow-post-deploy.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getIndexNowKeyLocation, isValidIndexNowKey } from "../src/shared/seo/indexNow.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../dist");

const key = process.env.INDEXNOW_KEY?.trim();
if (!key) {
  console.log("[write-indexnow-key] Skipped (INDEXNOW_KEY is not set)");
} else if (!isValidIndexNowKey(key)) {
  console.error(
    "[write-indexnow-key] INDEXNOW_KEY must be 8–128 characters of letters, numbers, and dashes"
  );
  process.exit(1);
} else {
  const keyFileName = `${key}.txt`;
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, keyFileName), `${key}\n`, "utf-8");
  console.log(`[write-indexnow-key] Wrote dist/${keyFileName} (${getIndexNowKeyLocation(key)})`);
}
