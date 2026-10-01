import type { EvalFixture } from "../types";
import { getPack, USE_CASE_PACKS } from "./index";
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
  const remotes = await Promise.all(packs.map(({ pack }) => api.resolve(pack.notebookTitle)));
  return new Map(
    packs.map(({ pack, local }, i): [string, PackReadiness] => [
      pack.id,
      checkPackReady(pack, local, remotes[i]),
    ])
  );
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
  const resolved = [...readiness];
  const texts = await Promise.all(resolved.map(([, r]) => api.sourceText(r.documentIds)));
  resolved.forEach(([id], i) => sourceTexts.set(id, texts[i]));
  return { fixtures: pinned, sourceTexts };
}

/**
 * Dry runs never talk to Convex, so pack fixtures have no seeded notebook.
 * Give them a placeholder so runner fixture validation (which requires a
 * notebookId) still exercises the rest of the fixture.
 */
export function pinForDryRun(fixtures: EvalFixture[]): EvalFixture[] {
  return fixtures.map((f) => (f.useCase ? { ...f, notebookId: `dry-run:${f.useCase}` } : f));
}

/**
 * Pack fixtures only run when explicitly selected: `--use-case`, or an id prefix
 * naming a registered pack ("<pack>/…"). Everything else (default, `--runner`,
 * a legacy prefix) drops them so an unseeded pack cannot abort a legacy run.
 * (`--case <id>` bypasses fixture selection entirely.)
 */
export function excludeUnselectedPackFixtures(
  ids: string[],
  lookup: (id: string) => EvalFixture,
  selection: { useCases?: string[]; idPrefix?: string },
  packIds: string[] = USE_CASE_PACKS.map((p) => p.pack.id)
): string[] {
  const { idPrefix } = selection;
  const explicit =
    selection.useCases !== undefined ||
    (idPrefix !== undefined && packIds.some((id) => idPrefix.startsWith(`${id}/`)));
  return explicit ? ids : ids.filter((id) => lookup(id).useCase === undefined);
}
