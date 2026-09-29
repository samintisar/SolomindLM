import type { EvalFixture } from "../types";
import { getPack } from "./index";
import type { PackSeedApi } from "./seedClient";
import { readPackSources, type SourceDigest } from "./sources";
import { checkPackReady, type PackReadiness } from "./sync";
import type { SourceText, UseCasePack } from "./types";

export class PackNotReadyError extends Error {
  constructor(readonly packs: PackReadiness[]) {
    const lines = ["Use-case pack(s) not ready on this deployment:"];
    for (const p of packs) {
      lines.push(`  ${p.useCase}:`);
      for (const problem of p.problems) lines.push(`    - ${problem}`);
      lines.push(`    → bun run eval:seed --use-case ${p.useCase}`);
    }
    super(lines.join("\n"));
    this.name = "PackNotReadyError";
  }
}

/** Resolve each pack's notebook once and check it against the committed sources. */
export async function resolvePackReadiness(
  packs: Array<{ pack: UseCasePack; local: SourceDigest[] }>,
  api: Pick<PackSeedApi, "resolve">
): Promise<Map<string, PackReadiness>> {
  const readiness = new Map<string, PackReadiness>();
  for (const { pack, local } of packs) {
    readiness.set(pack.id, checkPackReady(pack, local, await api.resolve(pack.notebookTitle)));
  }
  return readiness;
}

/**
 * Pin pack fixtures to their notebook and pack-only documents.
 * Throws PackNotReadyError (before any job runs) if any pack is not ready.
 */
export function applyPackResolution(
  fixtures: EvalFixture[],
  readiness: Map<string, PackReadiness>
): EvalFixture[] {
  const notReady = [...readiness.values()].filter((r) => r.problems.length > 0 || !r.notebookId);
  if (notReady.length > 0) throw new PackNotReadyError(notReady);
  return fixtures.map((fixture) => {
    if (!fixture.useCase) return fixture;
    const resolved = readiness.get(fixture.useCase);
    if (!resolved?.notebookId) {
      throw new Error(`No resolved notebook for use case "${fixture.useCase}" (${fixture.id})`);
    }
    return { ...fixture, notebookId: resolved.notebookId, documentIds: resolved.documentIds };
  });
}

/** One line per pack: "  <pack>: <runner>×<n> …" (runners in first-seen order). */
export function formatPlannedJobs(fixtures: EvalFixture[]): string {
  const byPack = new Map<string, Map<string, number>>();
  for (const f of fixtures) {
    if (!f.useCase) continue;
    const runners = byPack.get(f.useCase) ?? new Map<string, number>();
    runners.set(f.runner, (runners.get(f.runner) ?? 0) + 1);
    byPack.set(f.useCase, runners);
  }
  return [...byPack]
    .map(
      ([pack, runners]) =>
        `  ${pack}: ${[...runners].map(([runner, n]) => `${runner}×${n}`).join(" ")}`
    )
    .join("\n");
}

type LoadedPack = { pack: UseCasePack; local: SourceDigest[] };

const loadRegisteredPack = (id: string): LoadedPack => {
  const registered = getPack(id);
  return { pack: registered.pack, local: readPackSources(registered) };
};

/**
 * Resolve every pack the fixtures use, pin the fixtures to their notebooks, and
 * fetch each pack's source text (judge evidence). Throws PackNotReadyError
 * before any source text is fetched or any job runs.
 */
export async function prepareUseCaseRun(
  fixtures: EvalFixture[],
  api: Pick<PackSeedApi, "resolve" | "sourceText">,
  loadPack: (id: string) => LoadedPack = loadRegisteredPack
): Promise<{ fixtures: EvalFixture[]; sourceTexts: Map<string, SourceText[]> }> {
  const sourceTexts = new Map<string, SourceText[]>();
  const packIds = [...new Set(fixtures.flatMap((f) => (f.useCase ? [f.useCase] : [])))];
  if (packIds.length === 0) return { fixtures, sourceTexts };

  const readiness = await resolvePackReadiness(packIds.map(loadPack), api);
  const pinned = applyPackResolution(fixtures, readiness);
  for (const [id, resolved] of readiness) {
    sourceTexts.set(id, await api.sourceText(resolved.documentIds));
  }
  return { fixtures: pinned, sourceTexts };
}
