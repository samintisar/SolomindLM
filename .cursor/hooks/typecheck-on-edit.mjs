#!/usr/bin/env node
/**
 * Self-contained Cursor hook (Windows-safe: no relative imports).
 * Schedules debounced typecheck after edits; always prints {} and exits 0.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const _DEBOUNCE_MS = 1500;
const MCP_WRITE_TOOLS =
  /replace_content|create_text_file|replace_symbol_body|insert_before_symbol|insert_after_symbol/i;

function readStdinUtf8() {
  try {
    if (typeof process.stdin.setEncoding === "function") {
      process.stdin.setEncoding("utf8");
    }
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function shouldHandlePayload(payload) {
  const event = payload.hook_event_name;
  if (!event || event === "afterFileEdit") {
    return true;
  }
  if (event === "postToolUse") {
    const name = String(payload.tool_name ?? "");
    return /^(Write|StrReplace|EditNotebook)$/.test(name);
  }
  if (event === "afterMCPExecution") {
    const name = String(payload.tool_name ?? "");
    return MCP_WRITE_TOOLS.test(name);
  }
  return true;
}

function parseToolInput(toolInput) {
  if (toolInput == null) {
    return null;
  }
  if (typeof toolInput === "object") {
    return toolInput;
  }
  if (typeof toolInput === "string") {
    try {
      return JSON.parse(toolInput);
    } catch {
      return null;
    }
  }
  return null;
}

function toProjectRelative(rawPath, projectRoot) {
  const root = resolve(projectRoot);
  const candidate = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
  const rel = relative(root, candidate).replace(/\\/g, "/");
  if (rel.startsWith("..") || rel === "") {
    return null;
  }
  return rel;
}

function extractEditPaths(payload, projectRoot) {
  const paths = new Set();
  if (typeof payload.file_path === "string" && payload.file_path.length > 0) {
    paths.add(payload.file_path);
  }
  const toolInput = parseToolInput(payload.tool_input);
  if (toolInput) {
    for (const key of ["path", "file_path", "relative_path", "target_file"]) {
      const value = toolInput[key];
      if (typeof value === "string" && value.length > 0) {
        paths.add(value);
      }
    }
  }
  const normalized = [];
  for (const raw of paths) {
    const rel = toProjectRelative(raw, projectRoot);
    if (rel) {
      normalized.push(rel);
    }
  }
  return normalized;
}

function classifyTypecheckTargets(relativePaths) {
  let web = false;
  let convex = false;
  for (const rel of relativePaths) {
    if (/^apps\/web\/.*\.(ts|tsx)$/.test(rel)) {
      web = true;
    }
    if (/^convex\/.*\.ts$/.test(rel) && !rel.includes("/_generated/")) {
      convex = true;
    }
  }
  return { web, convex };
}

function scheduleTypechecks(projectRoot, targets) {
  if (!targets.web && !targets.convex) {
    return;
  }

  const hooksDir = join(projectRoot, ".cursor", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const pendingPath = join(hooksDir, ".typecheck-pending.json");
  const lockPath = join(hooksDir, ".typecheck-runner.lock");

  let pending = { web: false, convex: false, updatedAt: 0 };
  if (existsSync(pendingPath)) {
    try {
      pending = JSON.parse(readFileSync(pendingPath, "utf8"));
    } catch {
      pending = { web: false, convex: false, updatedAt: 0 };
    }
  }

  pending.web = pending.web || targets.web;
  pending.convex = pending.convex || targets.convex;
  pending.updatedAt = Date.now();
  writeFileSync(pendingPath, JSON.stringify(pending));

  if (existsSync(lockPath)) {
    return;
  }

  writeFileSync(lockPath, String(Date.now()));

  const runner = join(hooksDir, "run-pending-typechecks.mjs");
  const child = spawn(process.execPath, [runner], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      CURSOR_PROJECT_DIR: projectRoot,
      CLAUDE_PROJECT_DIR: projectRoot,
    },
  });
  child.unref();
}

try {
  const projectRoot =
    process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const payload = readStdinUtf8();
  if (shouldHandlePayload(payload)) {
    const relativePaths = extractEditPaths(payload, projectRoot);
    const targets = classifyTypecheckTargets(relativePaths);
    scheduleTypechecks(projectRoot, targets);
  }
} catch {
  // Hooks must not block the agent on internal errors.
}

process.exit(0);
