#!/usr/bin/env node

/**
 * Push variables from a local .env file to a Convex deployment.
 *
 * Defaults (repo convention):
 *   dev  → .env.local
 *   prod → .env (--prod)
 *
 * Usage:
 *   node scripts/push-convex-env.mjs [--prod] [--env-file <path>] [--dry-run]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterPushVars, parseEnv } from "./convex-env-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

const prod = args.includes("--prod");
const dryRun = args.includes("--dry-run");
const stopOnFirstError = args.includes("--stop-on-first-error");
const verbose = args.includes("--verbose");
const envFileIndex = args.indexOf("--env-file");
const defaultEnvFile = prod ? ".env" : ".env.local";
const envFilePath =
  envFileIndex >= 0 && args[envFileIndex + 1]
    ? path.resolve(process.cwd(), args[envFileIndex + 1])
    : path.join(projectRoot, defaultEnvFile);

const isWindows = process.platform === "win32";

/** Never log full secret values (dry-run / verbose). */
function redactForDisplay(key, value) {
  if (!value) return `${key}=`;
  if (value.length <= 12) return `${key}=***`;
  return `${key}=${value.slice(0, 4)}…(${value.length} chars)`;
}

if (!fs.existsSync(envFilePath)) {
  console.error(`Error: env file not found at ${envFilePath}`);
  console.error(`Expected ${defaultEnvFile} in the repo root (or pass --env-file).`);
  process.exit(1);
}

const vars = filterPushVars(parseEnv(fs.readFileSync(envFilePath, "utf8")));

if (vars.length === 0) {
  console.log("No variables to push.");
  process.exit(0);
}

const target = prod ? "production" : "dev";
console.log(
  `Pushing ${vars.length} env var(s) from ${path.basename(envFilePath)} to Convex (${target})...\n`
);

let failed = 0;

for (const [key, value] of vars) {
  const nameEqualsValue = `${key}=${value}`;
  const cmd = ["convex", "env", "set", nameEqualsValue];
  if (prod) cmd.push("--prod");

  if (dryRun) {
    console.log(`  npx convex env set "${redactForDisplay(key, value)}"${prod ? " --prod" : ""}`);
    continue;
  }

  if (verbose) {
    console.log(`\n> npx convex env set "${redactForDisplay(key, value)}"${prod ? " --prod" : ""}`);
  }

  const result = spawnSync("npx", cmd, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
    shell: isWindows,
  });

  if (result.status !== 0) {
    failed++;
    console.error(`Failed: ${key}`);
    if (stopOnFirstError) {
      console.error("\nStopped on first error. Re-run the failing command manually for details.");
      process.exit(1);
    }
  }
}

if (!dryRun && failed > 0) {
  console.error(`\n${failed} variable(s) failed to set.`);
  process.exit(1);
}

if (!dryRun) {
  console.log(`\nDone. ${vars.length} variable(s) set for ${target}.`);
}
