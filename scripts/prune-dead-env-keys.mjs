#!/usr/bin/env node
/**
 * Remove env keys that are not read by Convex runtime (hardcoded agent configs, legacy names).
 * Preserves comments and blank lines. Does not print values.
 *
 * A key the Convex code reads through `process.env.KEY` is never removed, even if it is listed
 * below, so a stale entry here cannot delete a live key (OPENAI_API_KEY was listed as dead
 * after embeddings moved to OpenAI).
 *
 * Usage: node scripts/prune-dead-env-keys.mjs [.env.local] [.env]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const DEAD_KEY = new Set([
  "ZHIPU_API_KEY",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]);

const DEAD_KEY_PATTERNS = [
  /^CHAT_(LLM_TEMPERATURE|VECTOR_MATCH_|RERANK_|MAX_RESULTS)/,
  /^SLIDES_(MAP_|REDUCE_|MIN_|MAX_|IMAGE_)/,
  /^REPORT_(MAP_|REDUCE_|COLLAPSE_|MAX_TOKENS|MAP_MAX|REDUCE_MAX)/,
  /^SPREADSHEET_(MAP_|REDUCE_|COLLAPSE_|MAP_MAX|REDUCE_MAX)/,
  /^FLASHCARD_(MAP_|REDUCE_)/,
  /^MINDMAP_(MAP_|REDUCE_)/,
  /^QUIZ_(MAP_|REDUCE_)/,
  /^AUDIO_(MAP_|REDUCE_|TTS_TIMEOUT)/,
  /^WRITTEN_QUESTIONS_(MAP_|REDUCE_)/,
];

/** Every key the Convex source reads as `process.env.KEY` (generated code excluded). */
export function findLiveKeys(convexDir = path.join(projectRoot, "convex")) {
  const live = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "_generated" && entry.name !== "node_modules") walk(full);
      } else if (entry.name.endsWith(".ts")) {
        for (const m of fs
          .readFileSync(full, "utf8")
          .matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
          live.add(m[1]);
        }
      }
    }
  };
  walk(convexDir);
  return live;
}

export function shouldRemove(key, liveKeys) {
  if (liveKeys.has(key)) return false;
  if (DEAD_KEY.has(key)) return true;
  return DEAD_KEY_PATTERNS.some((re) => re.test(key));
}

export function pruneFile(filePath, liveKeys) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  if (!fs.existsSync(abs)) {
    console.log(`Skip (missing): ${filePath}`);
    return 0;
  }

  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const out = [];
  let removed = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (shouldRemove(key, liveKeys)) {
      removed++;
      continue;
    }
    out.push(line);
  }

  let merged = out.join("\n");
  if (!merged.endsWith("\n")) merged += "\n";
  fs.writeFileSync(abs, merged, "utf8");
  console.log(`Pruned ${removed} key(s) from ${path.relative(projectRoot, abs)}`);
  return removed;
}

// Only prune when run as a script, so importing this module (tests) has no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const targets = process.argv.slice(2);
  const files = targets.length > 0 ? targets : [".env.local", ".env"];
  const liveKeys = findLiveKeys();

  let total = 0;
  for (const f of files) {
    total += pruneFile(f, liveKeys);
  }
  console.log(`Done. ${total} key(s) removed total.`);
}
