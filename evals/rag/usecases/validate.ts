import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { passageFound } from "../metrics/retrievalGold";
import type { ConcreteRunnerKind, EvalFixture } from "../types";
import { matchesTitleHint, SOURCE_CONTENT_TYPES, sourceExtension } from "./sources";
import type { RegisteredPack, SourceText } from "./types";

/** Sources whose text this module can read directly (PDF OCR text is only known at run time). */
const TEXT_EXTENSIONS = new Set([".md", ".txt"]);
const PASSAGE_WORDS = { min: 8, max: 30 };

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
    if (f.split !== "smoke" && f.split !== "train" && f.split !== "holdout") {
      problems.push(`${f.id}: pack fixtures must set split (smoke, train or holdout)`);
    }
    if (f.notebookId || f.documentIds) {
      problems.push(`${f.id}: pack fixtures must not set notebookId or documentIds`);
    }
    if (f.runner === "research" && !f.sourcePolicy?.channels?.length) {
      problems.push(`${f.id}: research fixtures must set sourcePolicy.channels`);
    }
    const hint = f.studioParams?.documentTitleHint;
    if (hint && !pack.sources.some((file) => matchesTitleHint(file, hint))) {
      problems.push(`${f.id}: documentTitleHint "${hint}" matches no pack source`);
    }
    if (f.runner === "both" || !pack.features.includes(f.runner as ConcreteRunnerKind)) {
      problems.push(`${f.id}: runner "${f.runner}" is not in pack features`);
    }
  }

  // Gold passages must be verbatim source text. The text check runs only when every source is
  // readable text (md/txt). A mixed pack could hold a quote only in its PDF, which this check
  // cannot read, so it is skipped there and the quotes are checked before the live run instead.
  // The word-count check always applies.
  const allSourcesText = pack.sources.every((file) => TEXT_EXTENSIONS.has(sourceExtension(file)));
  const textOfSources = allSourcesText
    ? pack.sources
        .filter((file) => onDisk?.has(file))
        .map((file) => readFileSync(join(sourcesDir, file), "utf-8"))
    : [];
  for (const f of fixtures) {
    for (const quote of f.expectedPassages ?? []) {
      const words = quote.trim().split(/\s+/).length;
      if (words < PASSAGE_WORDS.min || words > PASSAGE_WORDS.max) {
        problems.push(
          `${f.id}: expectedPassages quote has ${words} words (${PASSAGE_WORDS.min}-${PASSAGE_WORDS.max} required): "${quote}"`
        );
      }
      if (textOfSources.length > 0 && !textOfSources.some((t) => passageFound(t, quote))) {
        problems.push(
          `${f.id}: expectedPassages quote not found in ${pack.id} sources: "${quote}"`
        );
      }
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

/** Packs `eval:rag:dry` should validate: all registered ones for `--use-case`, else those with a selected fixture. */
export function packsToValidate(
  registered: RegisteredPack[],
  selected: EvalFixture[],
  useCaseFlag: boolean
): RegisteredPack[] {
  if (useCaseFlag) return registered;
  const used = new Set(selected.flatMap((f) => (f.useCase ? [f.useCase] : [])));
  return registered.filter((p) => used.has(p.pack.id));
}

/**
 * Live-run guard: "<fixture id>: <quote>" for every pack fixture quote missing from that pack's
 * extracted source text (`sourceTexts` by pack id). Catches OCR drift in PDF packs, which the
 * static check cannot read. Packs without extracted text are not checked.
 */
export function missingExpectedPassages(
  fixtures: EvalFixture[],
  sourceTexts: Map<string, SourceText[]>
): string[] {
  return fixtures.flatMap((f) => {
    const texts = f.useCase ? sourceTexts.get(f.useCase) : undefined;
    if (!texts) return [];
    return (f.expectedPassages ?? [])
      .filter((quote) => !texts.some((t) => passageFound(t.text, quote)))
      .map((quote) => `${f.id}: ${quote}`);
  });
}

/** "INVALID PACK <id>:" blocks for every invalid pack (empty when all are valid). */
export function formatPackProblems(packs: RegisteredPack[]): string[] {
  return packs.flatMap((registered) => {
    const problems = validatePack(registered);
    return problems.length === 0
      ? []
      : [`INVALID PACK ${registered.pack.id}:`, ...problems.map((p) => `  - ${p}`)];
  });
}
