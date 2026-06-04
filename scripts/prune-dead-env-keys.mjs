#!/usr/bin/env node
/**
 * Remove env keys that are not read by Convex runtime (hardcoded agent configs, legacy names).
 * Preserves comments and blank lines. Does not print values.
 *
 * Usage: node scripts/prune-dead-env-keys.mjs [.env.local] [.env]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const DEAD_KEY = new Set([
  "ZHIPU_API_KEY",
  "OPENAI_API_KEY",
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

function shouldRemove(key) {
  if (DEAD_KEY.has(key)) return true;
  return DEAD_KEY_PATTERNS.some((re) => re.test(key));
}

function pruneFile(filePath) {
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
    if (shouldRemove(key)) {
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

const targets = process.argv.slice(2);
const files = targets.length > 0 ? targets : [".env.local", ".env"];

let total = 0;
for (const f of files) {
  total += pruneFile(f);
}
console.log(`Done. ${total} key(s) removed total.`);
