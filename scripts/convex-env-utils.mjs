/**
 * Shared helpers for Convex env push/pull scripts.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

export const SKIP_PUSH_KEYS = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL", "RAG_EVAL_CONVEX_URL"]);

function isWindows() {
  return process.platform === "win32";
}

export function parseEnv(content) {
  const vars = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    vars.set(key, value);
  }
  return vars;
}

export function formatEnvValue(value) {
  if (value === "") return '""';
  if (/[\s#"'\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function mergeEnvFile(existingContent, updates) {
  const lines = existingContent.split(/\r?\n/);
  const touched = new Set();
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      result.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (updates.has(key)) {
      result.push(`${key}=${formatEnvValue(updates.get(key))}`);
      touched.add(key);
    } else {
      result.push(line);
    }
  }

  const appended = [];
  for (const [key, value] of updates) {
    if (!touched.has(key)) {
      appended.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  if (appended.length > 0) {
    if (result.length > 0 && result[result.length - 1] !== "") {
      result.push("");
    }
    result.push("# ─── Synced from Convex (convex:env:pull) ───");
    result.push(...appended);
  }

  let merged = result.join("\n");
  if (!merged.endsWith("\n")) merged += "\n";
  return merged;
}

export function listConvexEnv({ prod = false } = {}) {
  const cmd = ["convex", "env", "list"];
  if (prod) cmd.push("--prod");

  const result = spawnSync("npx", cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows(),
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Failed to list Convex env (${prod ? "prod" : "dev"}): ${err || "unknown error"}`
    );
  }

  const vars = new Map();
  for (const line of (result.stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    vars.set(key, value);
  }
  return vars;
}

export function filterPushVars(vars) {
  const filtered = [];
  for (const [key, value] of vars) {
    if (SKIP_PUSH_KEYS.has(key)) continue;
    if (key.startsWith("VITE_")) continue;
    filtered.push([key, value]);
  }
  return filtered;
}

export function syncWebFromRoot(rootEnvPath, webEnvPath) {
  if (!fs.existsSync(webEnvPath)) return { updated: 0 };

  const rootVars = parseEnv(fs.readFileSync(rootEnvPath, "utf8"));
  const webVars = parseEnv(fs.readFileSync(webEnvPath, "utf8"));
  const mapping = [
    ["CONVEX_URL", "VITE_CONVEX_URL"],
    ["CONVEX_SITE_URL", "VITE_CONVEX_SITE_URL"],
    ["SITE_URL", "SITE_URL"],
  ];

  let changed = false;
  for (const [from, to] of mapping) {
    if (!rootVars.has(from)) continue;
    const next = rootVars.get(from);
    if (webVars.get(to) !== next) {
      webVars.set(to, next);
      changed = true;
    }
  }

  if (!changed) return { updated: 0 };

  const merged = mergeEnvFile(fs.readFileSync(webEnvPath, "utf8"), webVars);
  fs.writeFileSync(webEnvPath, merged, "utf8");
  return { updated: 1 };
}
