#!/usr/bin/env node
/* eslint-env node */
/**
 * Push all variables from .env to Convex deployment.
 *
 * Usage:
 *   node scripts/push-convex-env.js [--prod] [--env-file <path>]
 *
 * Options:
 *   --prod       Push to production deployment (default: push to dev)
 *   --env-file   Path to .env file (default: .env in project root)
 *   --dry-run    Print commands without executing
 *   --stop-on-first-error  Stop after first failure (to see Convex error)
 *   --verbose    Print each command before running
 *
 * Skips: CONVEX_DEPLOYMENT, CONVEX_URL (local CLI config, not Convex env vars)
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

const prod = args.includes("--prod");
const dryRun = args.includes("--dry-run");
const stopOnFirstError = args.includes("--stop-on-first-error");
const verbose = args.includes("--verbose");
const envFileIndex = args.indexOf("--env-file");
const envFilePath =
  envFileIndex >= 0 && args[envFileIndex + 1]
    ? path.resolve(process.cwd(), args[envFileIndex + 1])
    : path.join(projectRoot, ".env");

const SKIP_KEYS = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL"]);
const isWindows = process.platform === "win32";

function parseEnv(content) {
  const vars = [];
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
    if (SKIP_KEYS.has(key)) continue;
    vars.push([key, value]);
  }
  return vars;
}

function main() {
  if (!fs.existsSync(envFilePath)) {
    console.error("Error: .env file not found at", envFilePath);
    process.exit(1);
  }

  const content = fs.readFileSync(envFilePath, "utf8");
  const vars = parseEnv(content);

  if (vars.length === 0) {
    console.log("No variables to push.");
    return;
  }

  const target = prod ? "production" : "dev";
  console.log(`Pushing ${vars.length} env var(s) to Convex (${target})...\n`);

  let failed = 0;
  let firstError = null;

  for (const [key, value] of vars) {
    // Use NAME=value single argument (CLI supports this) to avoid Windows arg parsing issues
    const nameEqualsValue = `${key}=${value}`;
    const cmd = ["convex", "env", "set", nameEqualsValue];
    if (prod) cmd.push("--prod");

    if (dryRun) {
      const display = value.length > 40 ? `${key}=${value.slice(0, 37)}...` : nameEqualsValue;
      console.log(`  npx convex env set "${display}"${prod ? " --prod" : ""}`);
      continue;
    }

    if (verbose) {
      const display = value.length > 50 ? `${key}=${value.slice(0, 47)}...` : nameEqualsValue;
      console.log(`\n> npx convex env set "${display}"${prod ? " --prod" : ""}`);
    }

    // On Windows, use shell so npx.cmd runs correctly and Convex sees a TTY when we use inherit
    const result = spawnSync("npx", cmd, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "inherit",
      shell: isWindows,
    });

    if (result.status !== 0) {
      failed++;
      if (!firstError) {
        firstError = { key, value: value.slice(0, 30) + (value.length > 30 ? "..." : "") };
      }
      console.error(`Failed: ${key}`);
      if (stopOnFirstError) {
        console.error(
          "\nStopped on first error. Run the command manually to see the full message:"
        );
        console.error(`  npx convex env set "${key}=<value>"${prod ? " --prod" : ""}`);
        process.exit(1);
      }
    }
  }

  if (firstError && !stopOnFirstError) {
    console.error("\nTo see why commands fail, run with: --stop-on-first-error");
    console.error("Then run the first failing command manually to see the Convex error.");
  }

  if (!dryRun && failed > 0) {
    console.error(`\n${failed} variable(s) failed to set.`);
    process.exit(1);
  }

  if (!dryRun) {
    console.log(`\nDone. ${vars.length} variable(s) set for ${target}.`);
  }
}

main();
