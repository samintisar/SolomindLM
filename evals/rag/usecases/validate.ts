import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ConcreteRunnerKind } from "../types";
import { SOURCE_CONTENT_TYPES, sourceExtension } from "./sources";
import type { RegisteredPack } from "./types";

/** Return every consistency problem in a pack (empty = valid). */
export function validatePack({ pack, fixtures, dir }: RegisteredPack): string[] {
  const problems: string[] = [];
  const sourcesDir = join(dir, "sources");
  const licensesPath = join(sourcesDir, "LICENSES.md");
  const licenses = existsSync(licensesPath) ? readFileSync(licensesPath, "utf-8") : null;
  // LICENSES.md format: one list entry per source, "- <fileName>: <licence, attribution, origin>"
  const licensed = new Set<string>();
  for (const line of (licenses ?? "").split(/\r?\n/)) {
    const match = /^\s*[-*]\s+([^:\s]+)\s*:/.exec(line);
    if (match) licensed.add(match[1]);
  }
  const onDisk = existsSync(sourcesDir) ? new Set(readdirSync(sourcesDir)) : null;

  if (licenses === null) problems.push(`${pack.id}: missing sources/LICENSES.md`);
  if (pack.sources.length === 0) problems.push(`${pack.id}: no sources listed`);
  if (new Set(pack.sources.map((f) => f.toLowerCase())).size !== pack.sources.length) {
    problems.push(`${pack.id}: duplicate source file names`);
  }

  for (const file of pack.sources) {
    if (basename(file) !== file || file.includes("..")) {
      problems.push(`${pack.id}: source "${file}" must be a plain file name`);
      continue;
    }
    if (!onDisk?.has(file)) {
      problems.push(`${pack.id}: source "${file}" not found in sources/`);
    }
    if (licenses !== null && !licensed.has(file)) {
      problems.push(`${pack.id}: source "${file}" has no entry in LICENSES.md`);
    }
    const ext = sourceExtension(file);
    if (!SOURCE_CONTENT_TYPES[ext]) {
      problems.push(`${pack.id}: source "${file}" has unsupported extension "${ext}"`);
    }
  }

  const seenIds = new Set<string>();
  for (const f of fixtures) {
    if (!f.id.startsWith(`${pack.id}/`)) {
      problems.push(`${f.id}: id must start with "${pack.id}/"`);
    }
    if (seenIds.has(f.id)) problems.push(`${f.id}: duplicate fixture id`);
    seenIds.add(f.id);
    if (f.useCase !== pack.id) problems.push(`${f.id}: useCase must be "${pack.id}"`);
    if (f.notebookId || f.documentIds) {
      problems.push(`${f.id}: pack fixtures must not set notebookId or documentIds`);
    }
    if (f.runner === "both" || !pack.features.includes(f.runner as ConcreteRunnerKind)) {
      problems.push(`${f.id}: runner "${f.runner}" is not in pack features`);
    }
  }

  const seenChecks = new Set<string>();
  for (const check of pack.rubric) {
    if (seenChecks.has(check.id)) problems.push(`${pack.id}: duplicate rubric check "${check.id}"`);
    seenChecks.add(check.id);
    if (!check.appliesTo.some((runner) => pack.features.includes(runner))) {
      problems.push(`${pack.id}: rubric check "${check.id}" applies to no listed feature`);
    }
  }

  return problems;
}
