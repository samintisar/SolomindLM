#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const DEBOUNCE_MS = 1500;

const projectRoot =
  process.env.CURSOR_PROJECT_DIR ||
  process.env.CLAUDE_PROJECT_DIR ||
  process.cwd();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(args) {
  return new Promise((resolve) => {
    const child = spawn("bun", args, {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

const hooksDir = join(projectRoot, ".cursor", "hooks");
const pendingPath = join(hooksDir, ".typecheck-pending.json");
const lockPath = join(hooksDir, ".typecheck-runner.lock");

await sleep(DEBOUNCE_MS);

let pending = { web: false, convex: false, updatedAt: 0 };
if (existsSync(pendingPath)) {
  try {
    pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  } catch {
    pending = { web: false, convex: false, updatedAt: 0 };
  }
}

const age = Date.now() - (pending.updatedAt || 0);
if (age < DEBOUNCE_MS - 50) {
  await sleep(DEBOUNCE_MS - age);
}

let finalPending = { web: false, convex: false };
if (existsSync(pendingPath)) {
  try {
    finalPending = JSON.parse(readFileSync(pendingPath, "utf8"));
  } catch {
    finalPending = { web: false, convex: false };
  }
}

writeFileSync(
  pendingPath,
  JSON.stringify({ web: false, convex: false, updatedAt: 0 }),
);

const jobs = [];
if (finalPending.web) {
  jobs.push(runCommand(["run", "typecheck:web"]));
}
if (finalPending.convex) {
  jobs.push(runCommand(["run", "typecheck:convex"]));
}

await Promise.all(jobs);

try {
  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }
} catch {
  // ignore
}
