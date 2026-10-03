/**
 * Design-lint ratchet. `--update` locks in lower counts and refuses any increase; the one exception is
 * `--update --new-rule=<id>` (repeatable), which records first counts for a rule absent from the baseline.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  blockedIncreases,
  type CountChange,
  type Counts,
  compareCounts,
  countViolations,
  isDegradedRun,
  type LintResult,
  rulesInBaseline,
  sortCounts,
} from "./design-lint/baseline";

const webRoot = path.resolve(import.meta.dir, "..");
const baselinePath = path.join(webRoot, "design-lint-baseline.json");
const update = process.argv.includes("--update");
const newRules = process.argv
  .filter((arg) => arg.startsWith("--new-rule="))
  .map((arg) => arg.slice("--new-rule=".length));

const proc = Bun.spawnSync(["bun", "x", "eslint", "src", "--format", "json"], {
  cwd: webRoot,
  stdout: "pipe",
  stderr: "pipe",
});
const stderr = proc.stderr.toString();
process.stderr.write(stderr);

// ESLint exits 0 (clean/warnings) or 1 (lint errors, still valid JSON); anything else is a
// crash or config error and stdout is not a lint report.
if (proc.exitCode !== 0 && proc.exitCode !== 1) {
  console.error(`design-lint: ESLint failed to run (exit ${proc.exitCode}); see output above.`);
  process.exit(2);
}

const degraded = isDegradedRun(stderr);
if (degraded.length > 0) {
  console.error(
    "design-lint: @shadcn/lint ran in a degraded mode (see warnings above), so its counts can't be compared with the baseline. Re-run; if it persists, fix the cause before updating the baseline."
  );
  process.exit(2);
}

let results: LintResult[];
try {
  results = JSON.parse(proc.stdout.toString());
} catch {
  console.error("design-lint: could not parse ESLint output");
  console.error(proc.stdout.toString().slice(0, 2000));
  process.exit(2);
}

const { counts, fatal } = countViolations(results);
if (fatal.length > 0) {
  console.error("design-lint: ESLint could not parse some files:");
  for (const line of fatal) console.error(`  ${line}`);
  process.exit(1);
}

const format = (c: CountChange) => `  ${c.area}  ${c.rule}: ${c.baseline} → ${c.current}`;
const hasBaseline = existsSync(baselinePath);
const baseline: Counts = hasBaseline ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
const { increases, decreases } = compareCounts(counts, baseline);

const alreadyTracked = rulesInBaseline(newRules, baseline);
if (alreadyTracked.length > 0) {
  console.error(
    `design-lint: --new-rule only applies to rules absent from the baseline; already tracked: ${alreadyTracked.join(", ")}`
  );
  process.exit(1);
}

const blocked = hasBaseline ? blockedIncreases(increases, baseline, { update, newRules }) : [];
if (blocked.length > 0) {
  console.error("design-lint: design-system violations increased (fix them, don't add new ones):");
  for (const change of blocked) console.error(format(change));
  if (update) console.error("design-lint: refusing to update a baseline that would go up.");
  process.exit(1);
}
const firstCounts = [
  ...new Set(increases.filter((change) => !blocked.includes(change)).map((change) => change.rule)),
];

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(sortCounts(counts), null, 2)}\n`);
  const outcome =
    hasBaseline && firstCounts.length > 0
      ? `updated (recorded first counts for: ${firstCounts.join(", ")})`
      : hasBaseline
        ? "lowered"
        : "created";
  console.log(`design-lint: baseline ${outcome} at ${baselinePath}`);
} else if (decreases.length > 0) {
  // In CI an un-lowered baseline is an error: otherwise fixing N violations and adding N new
  // ones in the same area would pass unnoticed.
  const log = process.env.CI ? console.error : console.log;
  log("design-lint: violations went down — run `bun run lint:design:update` to lock it in:");
  for (const change of decreases) log(format(change));
  if (process.env.CI) process.exit(1);
}

const errors = results.flatMap((r) =>
  r.messages
    .filter((m) => m.severity === 2)
    .map((m) => `  ${path.relative(webRoot, r.filePath)}:${m.line ?? 0}  ${m.ruleId}  ${m.message}`)
);
if (errors.length > 0) {
  console.error(`design-lint: ${errors.length} error(s) in migrated directories:`);
  for (const line of errors) console.error(line);
  process.exit(1);
}

console.log("design-lint: OK");
