#!/usr/bin/env node
/**
 * Pull Convex deployment env vars into local files.
 *
 * Defaults (repo convention):
 *   dev  deployment → .env.local
 *   prod deployment → .env
 *
 * Existing keys are updated in place; new Convex keys are appended.
 * Local-only keys (CONVEX_DEPLOYMENT, tuning vars, VITE_*, etc.) are kept.
 *
 * Usage:
 *   node scripts/pull-convex-env.mjs [--dev-only | --prod-only] [--no-sync-web]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listConvexEnv, mergeEnvFile, syncWebFromRoot } from "./convex-env-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

const devOnly = args.includes("--dev-only");
const prodOnly = args.includes("--prod-only");
const syncWeb = !args.includes("--no-sync-web");

if (devOnly && prodOnly) {
  console.error("Use only one of --dev-only or --prod-only.");
  process.exit(1);
}

const pullDev = !prodOnly;
const pullProd = !devOnly;

const targets = [];
if (pullDev) {
  targets.push({
    label: "dev",
    prod: false,
    envPath: path.join(projectRoot, ".env.local"),
    webPath: path.join(projectRoot, "apps/web/.env.local"),
  });
}
if (pullProd) {
  targets.push({
    label: "prod",
    prod: true,
    envPath: path.join(projectRoot, ".env"),
    webPath: path.join(projectRoot, "apps/web/.env"),
  });
}

function pullOne({ label, prod, envPath, webPath }) {
  console.log(`\nPulling Convex ${label} env → ${path.relative(projectRoot, envPath)}`);

  const remote = listConvexEnv({ prod });
  if (remote.size === 0) {
    console.log("  No variables returned from Convex.");
    return { updated: 0, appended: 0 };
  }

  if (!fs.existsSync(envPath)) {
    console.log(`  Creating ${path.basename(envPath)} (was missing).`);
  }
  const existing = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : `# ${path.basename(envPath)} — synced from Convex ${label}\n`;

  const before = new Set();
  for (const line of existing.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) before.add(trimmed.slice(0, eq).trim());
  }

  const merged = mergeEnvFile(existing, remote);
  fs.writeFileSync(envPath, merged, "utf8");

  let updated = 0;
  let appended = 0;
  for (const key of remote.keys()) {
    if (before.has(key)) updated++;
    else appended++;
  }

  console.log(`  ${remote.size} Convex var(s): ${updated} updated, ${appended} appended.`);

  if (syncWeb) {
    const web = syncWebFromRoot(envPath, webPath);
    if (web.updated) {
      console.log(
        `  Synced CONVEX_URL / CONVEX_SITE_URL / SITE_URL → ${path.relative(projectRoot, webPath)}`
      );
    } else if (!fs.existsSync(webPath)) {
      console.log(`  Skipped web sync (${path.relative(projectRoot, webPath)} not found).`);
    }
  }

  return { updated, appended };
}

console.log("Pulling environment variables from Convex...");

for (const target of targets) {
  pullOne(target);
}

console.log("\nDone. Review gitignored env files before sharing.");
console.log("Push local → Convex: bun run convex:env:push (dev) / convex:env:push:prod");
