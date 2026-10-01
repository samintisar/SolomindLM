# Use-case Eval Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the framework that runs every agent against content from each advertised use case (language learners, medical students, professionals, researchers) and reports a scorecard per use case.

**Architecture:** A pack is a folder under `evals/rag/usecases/<id>/` holding committed sources, a manifest, and fixtures. `eval:seed` syncs the sources into the eval owner's notebooks in the `Test` folder, using gated Convex actions that feed the normal ingestion job. `eval:rag --use-case` resolves those notebooks before any job runs, pins fixtures to the pack's documents, adds per-pack rubric judges, and prints a pack × feature scorecard.

**Tech Stack:** Bun, TypeScript, Vitest (`vitest.convex.config.ts`), `convex-test`, Convex actions and internal functions, `ConvexHttpClient`, the existing Together binary-judge invoker.

**Spec:** [`docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md`](../specs/2026-09-29-use-case-eval-packs-design.md)

**Ground rules for this repo:**
- Work in this worktree (`.claude/worktrees/eval-pipeline-upgrade-0dfdee`, branch `claude/eval-pipeline-upgrade-0dfdee`). Never touch the main checkout.
- Read `convex/_generated/ai/guidelines.md` before Task 6.
- Serena edits leave CRLF line endings. Run `bun x biome format --write <files>` on every changed file before committing.
- Run a single test file with `bun x vitest run --config vitest.convex.config.ts <path>`.
- This PR ships **no pack contents**: `USE_CASE_PACKS` stays empty. The first pack PR exercises the framework end to end.
- Rubric text must never be copied into production prompts (CLAUDE.md prompt rule).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `evals/rag/types.ts` | modify | `useCase?` on `EvalFixture` and `EvalRunArtifact`; `scorecard?` on `EvalReport`; `byUseCase` on `CompareReport` |
| `evals/rag/usecases/types.ts` | create | `UseCasePack`, `RubricCheck`, `RegisteredPack`, `SourceText` |
| `evals/rag/usecases/sources.ts` | create | Read and hash pack source files; supported extensions |
| `evals/rag/usecases/validate.ts` | create | `validatePack()`: pack/fixture/rubric consistency |
| `evals/rag/usecases/index.ts` | create | `USE_CASE_PACKS` registry, `getPack`, `registerPack`, `listPackFixtures` |
| `evals/rag/usecases/sync.ts` | create | Pure `planPackSync`, `checkPackReady` |
| `evals/rag/usecases/prodGuard.ts` | create | `assertNotProdConvexUrl` |
| `evals/rag/usecases/seedClient.ts` | create | `PackSeedApi` interface and `seedPack` orchestration |
| `evals/rag/usecases/convexSeedApi.ts` | create | `PackSeedApi` backed by Convex actions |
| `evals/rag/usecases/resolve.ts` | create | `resolvePackReadiness`, `applyPackResolution`, `PackNotReadyError`, `formatPlannedJobs` |
| `evals/rag/seed.ts` | create | `eval:seed` CLI entry |
| `evals/rag/fixtures/index.ts` | modify | Merge pack fixtures into `FIXTURES` |
| `evals/rag/cli.ts` | modify | `--use-case`, pack resolution, artifact `useCase`, scorecard wiring |
| `evals/rag/metrics/rubric.ts` | create | Rubric judges |
| `evals/rag/metrics/scorers.ts` | modify | Call rubric judges for pack fixtures |
| `evals/rag/reports/judgeQueue.ts` | modify | Include `rubric:` metrics in the calibration queue |
| `evals/rag/reports/scorecard.ts` | create | `buildScorecard`, `formatScorecard`, `isJudgeError` |
| `evals/rag/reports/reportGenerator.ts` | modify | Attach and print the scorecard |
| `evals/rag/reports/compare.ts` | modify | `tallyWins`, `byUseCase` |
| `convex/documents/index.ts` | modify | Export `deleteAllChunksForDocument` |
| `convex/eval/_seedPack.ts` | create | Internal queries/mutations for pack notebooks and documents |
| `convex/eval/seedEvalAction.ts` | create | Gated public actions the seeder and CLI call |
| `package.json` | modify | `eval:seed`, `eval:usecases`, `eval:usecases:dry` |
| `evals/rag/env.eval.example`, `scripts/bootstrap-rag-eval-env.js`, `evals/rag/usecases/README.md`, `CLAUDE.md` | modify/create | Docs and env |

---

### Task 0: Sync and baseline

- [ ] **Step 1: Bring the branch up to date with `main`**

Call the `sync_with_base_branch` tool (ccd_host). Expected: merges `4e2c4b42 fix(studio): stop flashcards from giving the answer away on the front (#224)` with no conflicts.

- [ ] **Step 2: Check the dependency PR**

Run: `gh pr view 209 --json state --jq .state`
If it prints `MERGED`, sync again. If it's still `OPEN`, continue anyway. Only live rubric scoring depends on it, and Task 12 re-checks it.

- [ ] **Step 3: Baseline tests**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag`
Expected: all pass. Record the count so later regressions are obvious.

---

### Task 1: Types

**Files:**
- Create: `evals/rag/usecases/types.ts`
- Modify: `evals/rag/types.ts` (`EvalFixture`, `EvalRunArtifact`)

- [ ] **Step 1: Create `evals/rag/usecases/types.ts`**

```ts
/**
 * Use-case eval packs: one folder per advertised use case
 * (see docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md).
 */
import type { ConcreteRunnerKind, EvalFixture } from "../types";

/** Folder in the eval owner's account that holds every pack notebook. */
export const EVAL_PACK_FOLDER_NAME = "Test";

/**
 * A yes/no quality check a judge answers about one output.
 * Describe what a good output looks like for the audience; never reference
 * specific fixture contents. Rubric text stays in eval code only.
 */
export interface RubricCheck {
  /** kebab-case, unique within the pack */
  id: string;
  /** Yes/no question about the output; "yes" means pass */
  question: string;
  /** Runners this check applies to */
  appliesTo: ConcreteRunnerKind[];
  /** "sources" also gives the judge source excerpts */
  evidence: "output" | "sources";
}

export interface UseCasePack {
  /** e.g. "language-learners"; must match the folder name */
  id: string;
  title: string;
  /** Notebook title inside the eval owner's Test folder */
  notebookTitle: string;
  /** Landing-page claim this pack verifies */
  advertisedClaim: string;
  /** Runners the pack exercises */
  features: ConcreteRunnerKind[];
  /** File names under the pack's sources/ folder */
  sources: string[];
  rubric: RubricCheck[];
}

export interface RegisteredPack {
  pack: UseCasePack;
  fixtures: EvalFixture[];
  /** Absolute path of the pack folder (contains sources/) */
  dir: string;
}

/** Extracted text of one pack source document, used as judge evidence. */
export interface SourceText {
  fileName: string;
  text: string;
}
```

- [ ] **Step 2: Add `useCase` to `EvalFixture`**

In `evals/rag/types.ts`, inside `interface EvalFixture`, directly after the `split?: EvalSplit;` line add:

```ts
  /**
   * Use-case pack id (evals/rag/usecases/<id>). Pack fixtures leave
   * notebookId/documentIds unset; the CLI fills them from the seeded notebook.
   */
  useCase?: string;
```

- [ ] **Step 3: Add `useCase` to `EvalRunArtifact`**

In the same file, inside `interface EvalRunArtifact`, directly before `/** Timestamp */` add:

```ts
  /** Use-case pack id copied from the fixture (for scorecards and compare) */
  useCase?: string;
```

- [ ] **Step 4: Run the eval tests**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag`
Expected: same pass count as Task 0 (types only).

- [ ] **Step 5: Commit**

```bash
bun x biome format --write evals/rag/types.ts evals/rag/usecases/types.ts
git add evals/rag/types.ts evals/rag/usecases/types.ts
git commit -m "feat(evals): add use-case pack types"
```

---

### Task 2: Pack sources and validation

**Files:**
- Create: `evals/rag/usecases/sources.ts`, `evals/rag/usecases/validate.ts`
- Test: `evals/rag/usecases/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/usecases/validate.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { readPackSources } from "./sources";
import type { RegisteredPack, UseCasePack } from "./types";
import { validatePack } from "./validate";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pack-"));
  mkdirSync(join(dir, "sources"));
  writeFileSync(join(dir, "sources", "unit-1.md"), "# Unit 1\nBonjour means hello.");
  writeFileSync(join(dir, "sources", "LICENSES.md"), "- unit-1.md: CC BY 4.0, Example Author");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function pack(overrides: Partial<UseCasePack> = {}): UseCasePack {
  return {
    id: "language-learners",
    title: "Language Learners",
    notebookTitle: "Language Learners",
    advertisedClaim: "Create vocabulary lists and grammar exercises from any content.",
    features: ["flashcards", "quiz"],
    sources: ["unit-1.md"],
    rubric: [
      {
        id: "one-item-per-card",
        question: "Does each card test exactly one item?",
        appliesTo: ["flashcards"],
        evidence: "output",
      },
    ],
    ...overrides,
  };
}

function fixture(overrides: Partial<EvalFixture> = {}): EvalFixture {
  return {
    schemaVersion: 1,
    id: "language-learners/flashcards-vocab-01",
    question: "Make flashcards for the vocabulary in unit 1",
    expectedItems: [],
    expectedBehavior: "Cards cover unit 1 vocabulary",
    runner: "flashcards",
    tags: ["use-case"],
    useCase: "language-learners",
    ...overrides,
  };
}

function registered(p: UseCasePack, fixtures: EvalFixture[] = [fixture()]): RegisteredPack {
  return { pack: p, fixtures, dir };
}

describe("validatePack", () => {
  it("accepts a consistent pack", () => {
    expect(validatePack(registered(pack()))).toEqual([]);
  });

  it("flags a missing source file and a source without a licence entry", () => {
    const problems = validatePack(registered(pack({ sources: ["unit-1.md", "unit-2.md"] })));
    expect(problems).toContain('language-learners: source "unit-2.md" not found in sources/');
    expect(problems).toContain('language-learners: source "unit-2.md" has no entry in LICENSES.md');
  });

  it("flags an unsupported source extension", () => {
    writeFileSync(join(dir, "sources", "clip.mp4"), "x");
    writeFileSync(join(dir, "sources", "LICENSES.md"), "- unit-1.md\n- clip.mp4");
    const problems = validatePack(registered(pack({ sources: ["clip.mp4"] })));
    expect(problems).toContain('language-learners: source "clip.mp4" has unsupported extension ".mp4"');
  });

  it("flags fixture id prefix, useCase, pinned notebook and runner problems", () => {
    const problems = validatePack(
      registered(pack(), [
        fixture({ id: "flashcards-vocab-01" }),
        fixture({ id: "language-learners/x", useCase: "medical-students" }),
        fixture({ id: "language-learners/y", notebookId: "nb" }),
        fixture({ id: "language-learners/z", runner: "report" }),
      ])
    );
    expect(problems).toContain('flashcards-vocab-01: id must start with "language-learners/"');
    expect(problems).toContain('language-learners/x: useCase must be "language-learners"');
    expect(problems).toContain(
      "language-learners/y: pack fixtures must not set notebookId or documentIds"
    );
    expect(problems).toContain('language-learners/z: runner "report" is not in pack features');
  });

  it("flags duplicate fixture ids and rubric checks that apply to no feature", () => {
    const problems = validatePack(
      registered(
        pack({
          rubric: [
            { id: "a", question: "?", appliesTo: ["report"], evidence: "output" },
            { id: "a", question: "?", appliesTo: ["quiz"], evidence: "output" },
          ],
        }),
        [fixture(), fixture()]
      )
    );
    expect(problems).toContain("language-learners/flashcards-vocab-01: duplicate fixture id");
    expect(problems).toContain('language-learners: rubric check "a" applies to no listed feature');
    expect(problems).toContain('language-learners: duplicate rubric check "a"');
  });
});

describe("readPackSources", () => {
  it("hashes each listed source and infers its content type", () => {
    const [file] = readPackSources(registered(pack()));
    expect(file.fileName).toBe("unit-1.md");
    expect(file.contentType).toBe("text/markdown");
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(file.bytes)).toContain("Bonjour");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/validate.test.ts`
Expected: FAIL (cannot resolve `./sources` / `./validate`).

- [ ] **Step 3: Create `evals/rag/usecases/sources.ts`**

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { RegisteredPack } from "./types";

/** Extensions the ingestion pipeline (convex/documents/embeddingJob.ts) handles, with upload content types. */
export const SOURCE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".md": "text/markdown",
  ".txt": "text/plain",
};

export interface SourceDigest {
  fileName: string;
  sha256: string;
}

export interface LocalSourceFile extends SourceDigest {
  contentType: string;
  bytes: Uint8Array;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sourceExtension(fileName: string): string {
  return extname(fileName).toLowerCase();
}

/** Read every source listed in the manifest, in manifest order. */
export function readPackSources({ pack, dir }: RegisteredPack): LocalSourceFile[] {
  return pack.sources.map((fileName) => {
    const bytes = new Uint8Array(readFileSync(join(dir, "sources", fileName)));
    return {
      fileName,
      sha256: sha256Hex(bytes),
      contentType: SOURCE_CONTENT_TYPES[sourceExtension(fileName)] ?? "application/octet-stream",
      bytes,
    };
  });
}
```

- [ ] **Step 4: Create `evals/rag/usecases/validate.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConcreteRunnerKind } from "../types";
import { SOURCE_CONTENT_TYPES, sourceExtension } from "./sources";
import type { RegisteredPack } from "./types";

/** Return every consistency problem in a pack (empty = valid). */
export function validatePack({ pack, fixtures, dir }: RegisteredPack): string[] {
  const problems: string[] = [];
  const sourcesDir = join(dir, "sources");
  const licensesPath = join(sourcesDir, "LICENSES.md");
  const licenses = existsSync(licensesPath) ? readFileSync(licensesPath, "utf-8") : null;

  if (licenses === null) problems.push(`${pack.id}: missing sources/LICENSES.md`);
  if (pack.sources.length === 0) problems.push(`${pack.id}: no sources listed`);
  if (new Set(pack.sources).size !== pack.sources.length) {
    problems.push(`${pack.id}: duplicate source file names`);
  }

  for (const file of pack.sources) {
    if (!existsSync(join(sourcesDir, file))) {
      problems.push(`${pack.id}: source "${file}" not found in sources/`);
    }
    if (licenses !== null && !licenses.includes(file)) {
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
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/validate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
bun x biome format --write evals/rag/usecases
git add evals/rag/usecases
git commit -m "feat(evals): validate use-case packs and hash their sources"
```

---

### Task 3: Pack registry and fixture merge

**Files:**
- Create: `evals/rag/usecases/index.ts`
- Modify: `evals/rag/fixtures/index.ts`
- Test: `evals/rag/usecases/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/usecases/registry.test.ts`:

```ts
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import { getPack, listPackFixtures, USE_CASE_PACKS } from "./index";
import { validatePack } from "./validate";

describe("use-case pack registry", () => {
  it("every registered pack is valid and lives in its own folder", () => {
    for (const registered of USE_CASE_PACKS) {
      expect(validatePack(registered)).toEqual([]);
      expect(basename(registered.dir)).toBe(registered.pack.id);
      expect(existsSync(registered.dir)).toBe(true);
    }
  });

  it("pack ids and notebook titles are unique", () => {
    const ids = USE_CASE_PACKS.map((p) => p.pack.id);
    const titles = USE_CASE_PACKS.map((p) => p.pack.notebookTitle);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("pack fixtures are registered in FIXTURES", () => {
    for (const fixture of listPackFixtures()) {
      expect(FIXTURES[fixture.id]).toBe(fixture);
    }
  });

  it("getPack names the registered packs when the id is unknown", () => {
    expect(() => getPack("no-such-pack")).toThrow(/Unknown use-case pack "no-such-pack"/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/registry.test.ts`
Expected: FAIL (cannot resolve `./index`).

- [ ] **Step 3: Create `evals/rag/usecases/index.ts`**

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalFixture } from "../types";
import type { RegisteredPack, UseCasePack } from "./types";

const USECASES_DIR = dirname(fileURLToPath(import.meta.url));

/** Build a registry entry for a pack folder under evals/rag/usecases/<pack.id>/. */
export function registerPack(pack: UseCasePack, fixtures: EvalFixture[]): RegisteredPack {
  return { pack, fixtures, dir: join(USECASES_DIR, pack.id) };
}

/**
 * Registered use-case packs. Each pack PR adds one entry, e.g.
 *   registerPack(languageLearnersPack, languageLearnersFixtures),
 */
export const USE_CASE_PACKS: RegisteredPack[] = [];

export function getPack(id: string): RegisteredPack {
  const found = USE_CASE_PACKS.find((p) => p.pack.id === id);
  if (!found) {
    const known = USE_CASE_PACKS.map((p) => p.pack.id).join(", ") || "(none)";
    throw new Error(`Unknown use-case pack "${id}". Registered: ${known}`);
  }
  return found;
}

export function listPackFixtures(): EvalFixture[] {
  return USE_CASE_PACKS.flatMap((p) => p.fixtures);
}
```

- [ ] **Step 4: Merge pack fixtures into `FIXTURES`**

In `evals/rag/fixtures/index.ts`:

Add to the imports (keep Biome's sorted order):

```ts
import { listPackFixtures } from "../usecases";
```

In the `FIXTURES` object literal, after the `// Literature review fixtures` spread, add:

```ts
  // Use-case pack fixtures (evals/rag/usecases/<pack>/fixtures.ts)
  ...Object.fromEntries(listPackFixtures().map((f) => [f.id, f])),
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag`
Expected: PASS, including `registry.test.ts` (the loops are empty until the first pack lands; the `getPack` test is real).

- [ ] **Step 6: Commit**

```bash
bun x biome format --write evals/rag/usecases evals/rag/fixtures/index.ts
git add evals/rag/usecases evals/rag/fixtures/index.ts
git commit -m "feat(evals): add use-case pack registry"
```

---

### Task 4: Sync planning and readiness (pure)

**Files:**
- Create: `evals/rag/usecases/sync.ts`
- Test: `evals/rag/usecases/sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/usecases/sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkPackReady, planPackSync, type RemotePackDoc } from "./sync";
import type { UseCasePack } from "./types";

const local = [
  { fileName: "a.pdf", sha256: "aaa" },
  { fileName: "b.md", sha256: "bbb" },
  { fileName: "c.md", sha256: "ccc" },
  { fileName: "d.md", sha256: "ddd" },
];

const remote: RemotePackDoc[] = [
  { documentId: "doc-b", fileName: "b.md", status: "completed", sha256: "old" },
  { documentId: "doc-c", fileName: "c.md", status: "failed", sha256: "ccc", error: "OCR failed" },
  { documentId: "doc-d", fileName: "d.md", status: "completed", sha256: "ddd" },
  { documentId: "doc-x", fileName: "added-by-hand.pdf", status: "completed" },
];

const pack = { id: "p", notebookTitle: "P" } as UseCasePack;

describe("planPackSync", () => {
  it("uploads missing, replaces changed or failed, skips up-to-date, ignores unrelated docs", () => {
    expect(planPackSync(local, remote)).toEqual([
      { kind: "upload", fileName: "a.pdf" },
      { kind: "replace", fileName: "b.md", documentId: "doc-b", reason: "changed" },
      { kind: "replace", fileName: "c.md", documentId: "doc-c", reason: "failed" },
      { kind: "skip", fileName: "d.md", documentId: "doc-d" },
    ]);
  });

  it("skips a matching document that is still processing (the seeder waits for it)", () => {
    const processing = [{ documentId: "d1", fileName: "a.pdf", status: "processing", sha256: "aaa" }];
    expect(planPackSync([local[0]], processing)).toEqual([
      { kind: "skip", fileName: "a.pdf", documentId: "d1" },
    ]);
  });
});

describe("checkPackReady", () => {
  it("reports a missing notebook", () => {
    expect(checkPackReady(pack, local, null)).toEqual({
      useCase: "p",
      notebookId: null,
      documentIds: [],
      problems: ['notebook "P" not found in the Test folder'],
    });
  });

  it("lists per-file problems and only pack document ids", () => {
    const result = checkPackReady(pack, local, { notebookId: "nb", docs: remote });
    expect(result.notebookId).toBe("nb");
    expect(result.documentIds).toEqual(["doc-b", "doc-c", "doc-d"]);
    expect(result.problems).toEqual([
      "a.pdf: not uploaded",
      "b.md: out of date",
      "c.md: failed (OCR failed)",
    ]);
  });

  it("is ready when every source is completed and current", () => {
    const docs = local.map((f, i) => ({
      documentId: `d${i}`,
      fileName: f.fileName,
      status: "completed",
      sha256: f.sha256,
    }));
    expect(checkPackReady(pack, local, { notebookId: "nb", docs }).problems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/sync.test.ts`
Expected: FAIL (cannot resolve `./sync`).

- [ ] **Step 3: Create `evals/rag/usecases/sync.ts`**

```ts
import type { SourceDigest } from "./sources";
import { EVAL_PACK_FOLDER_NAME, type UseCasePack } from "./types";

/** A document in a pack notebook, as returned by the resolvePackNotebook action. */
export interface RemotePackDoc {
  documentId: string;
  fileName: string;
  status: string;
  sha256?: string;
  error?: string;
  totalChunks?: number;
}

export interface RemotePackNotebook {
  notebookId: string;
  docs: RemotePackDoc[];
}

export type SyncAction =
  | { kind: "upload"; fileName: string }
  | { kind: "replace"; fileName: string; documentId: string; reason: "changed" | "failed" }
  | { kind: "skip"; fileName: string; documentId: string };

/** Decide what the seeder does for each committed source. Unrelated notebook docs are left alone. */
export function planPackSync(local: SourceDigest[], remote: RemotePackDoc[]): SyncAction[] {
  return local.map((file): SyncAction => {
    const doc = remote.find((d) => d.fileName === file.fileName);
    if (!doc) return { kind: "upload", fileName: file.fileName };
    if (doc.status === "failed") {
      return { kind: "replace", fileName: file.fileName, documentId: doc.documentId, reason: "failed" };
    }
    if (doc.sha256 !== file.sha256) {
      return { kind: "replace", fileName: file.fileName, documentId: doc.documentId, reason: "changed" };
    }
    return { kind: "skip", fileName: file.fileName, documentId: doc.documentId };
  });
}

export interface PackReadiness {
  useCase: string;
  notebookId: string | null;
  /** Documents matching the pack's sources (never hand-added docs) */
  documentIds: string[];
  /** Empty when the pack is ready to run */
  problems: string[];
}

/** A pack is ready when every source is present, current and completed. */
export function checkPackReady(
  pack: UseCasePack,
  local: SourceDigest[],
  remote: RemotePackNotebook | null
): PackReadiness {
  if (!remote) {
    return {
      useCase: pack.id,
      notebookId: null,
      documentIds: [],
      problems: [`notebook "${pack.notebookTitle}" not found in the ${EVAL_PACK_FOLDER_NAME} folder`],
    };
  }
  const problems: string[] = [];
  const documentIds: string[] = [];
  for (const file of local) {
    const doc = remote.docs.find((d) => d.fileName === file.fileName);
    if (!doc) {
      problems.push(`${file.fileName}: not uploaded`);
      continue;
    }
    documentIds.push(doc.documentId);
    if (doc.sha256 !== file.sha256) {
      problems.push(`${file.fileName}: out of date`);
    } else if (doc.status !== "completed") {
      problems.push(`${file.fileName}: ${doc.status}${doc.error ? ` (${doc.error})` : ""}`);
    }
  }
  return { useCase: pack.id, notebookId: remote.notebookId, documentIds, problems };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/sync.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
bun x biome format --write evals/rag/usecases
git add evals/rag/usecases
git commit -m "feat(evals): plan pack source sync and check pack readiness"
```

---

### Task 5: Prod guard

**Files:**
- Create: `evals/rag/usecases/prodGuard.ts`
- Test: `evals/rag/usecases/prodGuard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assertNotProdConvexUrl } from "./prodGuard";

describe("assertNotProdConvexUrl", () => {
  it("throws when the eval URL is the prod deployment", () => {
    expect(() =>
      assertNotProdConvexUrl("https://happy-otter-123.convex.cloud", "prod:happy-otter-123")
    ).toThrow(/prod deployment "happy-otter-123"/);
  });

  it("ignores a trailing comment on CONVEX_DEPLOYMENT", () => {
    expect(() =>
      assertNotProdConvexUrl(
        "https://happy-otter-123.convex.cloud",
        "prod:happy-otter-123 # team: me, project: solomindlm"
      )
    ).toThrow();
  });

  it("allows a dev URL, a dev deployment, or no deployment", () => {
    expect(() =>
      assertNotProdConvexUrl("https://calm-fox-456.convex.cloud", "prod:happy-otter-123")
    ).not.toThrow();
    expect(() =>
      assertNotProdConvexUrl("https://calm-fox-456.convex.cloud", "dev:calm-fox-456")
    ).not.toThrow();
    expect(() => assertNotProdConvexUrl("https://calm-fox-456.convex.cloud", undefined)).not.toThrow();
  });
});
```

Save as `evals/rag/usecases/prodGuard.test.ts`.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/prodGuard.test.ts`
Expected: FAIL (cannot resolve `./prodGuard`).

- [ ] **Step 3: Create `evals/rag/usecases/prodGuard.ts`**

```ts
/**
 * Refuse to seed when RAG_EVAL_CONVEX_URL points at the prod deployment named in
 * CONVEX_DEPLOYMENT ("prod:<name>", as written by `convex:env:pull:prod`).
 * Second line of defence; the server gate (RAG_EVALS_ENABLED) is the first.
 */
export function assertNotProdConvexUrl(evalUrl: string, convexDeployment: string | undefined): void {
  if (!convexDeployment?.startsWith("prod:")) return;
  const name = convexDeployment.slice("prod:".length).split("#")[0]?.trim();
  if (!name) return;
  const host = new URL(evalUrl).hostname;
  if (host === name || host.startsWith(`${name}.`)) {
    throw new Error(
      `Refusing to run: RAG_EVAL_CONVEX_URL points at the prod deployment "${name}". Use your dev deployment.`
    );
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/prodGuard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
bun x biome format --write evals/rag/usecases
git add evals/rag/usecases
git commit -m "feat(evals): refuse to seed against the prod deployment"
```

---

### Task 6: Convex internal functions for pack notebooks

Read `convex/_generated/ai/guidelines.md` first.

**Files:**
- Modify: `convex/documents/index.ts:42` (export `deleteAllChunksForDocument`)
- Create: `convex/eval/_seedPack.ts`
- Test: `convex/eval/_seedPack.test.ts`

- [ ] **Step 1: Export the chunk-deletion helper**

In `convex/documents/index.ts`, change `async function deleteAllChunksForDocument(` to:

```ts
export async function deleteAllChunksForDocument(
```

- [ ] **Step 2: Create `convex/eval/_seedPack.ts`**

```ts
/**
 * Internal functions behind the use-case eval pack seeder. Called only from
 * [seedEvalAction.ts](./seedEvalAction.ts), which gates on RAG_EVAL_SECRET and
 * resolves the owner from RAG_EVAL_OWNER_EMAIL. Pack notebooks live in the
 * owner's "Test" folder; uploads go through the normal docEmbedding job.
 */
import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import * as Notebooks from "../_model/notebooks";
import { deleteAllChunksForDocument } from "../documents/index";

/** Keep in sync with EVAL_PACK_FOLDER_NAME in evals/rag/usecases/types.ts. */
export const EVAL_PACK_FOLDER_NAME = "Test";

const SOURCE_TEXT_MAX_CHARS = 50_000;

export const packDocValidator = v.object({
  documentId: v.id("documents"),
  fileName: v.string(),
  status: v.string(),
  sha256: v.optional(v.string()),
  error: v.optional(v.string()),
  totalChunks: v.optional(v.number()),
});

export const packNotebookValidator = v.object({
  notebookId: v.id("notebooks"),
  docs: v.array(packDocValidator),
});

export type PackNotebook = Infer<typeof packNotebookValidator>;

export const packSourceTextValidator = v.array(v.object({ fileName: v.string(), text: v.string() }));

export type PackSourceText = Infer<typeof packSourceTextValidator>;

type DbReader = QueryCtx["db"];

async function ownerIdByEmail(db: DbReader, email: string): Promise<Id<"users">> {
  const user = await db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (!user) {
    throw new Error(`RAG_EVAL_OWNER_EMAIL: no user with email ${email} on this deployment.`);
  }
  return user._id;
}

async function findEvalFolder(db: DbReader, userId: Id<"users">): Promise<Doc<"folders"> | null> {
  const folders = await db
    .query("folders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return folders.find((f) => f.name === EVAL_PACK_FOLDER_NAME) ?? null;
}

async function findNotebookInFolder(
  db: DbReader,
  userId: Id<"users">,
  folderId: Id<"folders">,
  title: string
): Promise<Doc<"notebooks"> | null> {
  const notebooks = await db
    .query("notebooks")
    .withIndex("by_folder", (q) => q.eq("folderId", folderId))
    .collect();
  return notebooks.find((n) => n.userId === userId && n.title === title) ?? null;
}

function readSourceSha(metadata: unknown): string | undefined {
  if (metadata && typeof metadata === "object" && "evalSourceSha256" in metadata) {
    const value = (metadata as { evalSourceSha256: unknown }).evalSourceSha256;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export const findPackNotebook = internalQuery({
  args: { ownerEmail: v.string(), notebookTitle: v.string() },
  returns: v.union(v.null(), packNotebookValidator),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const folder = await findEvalFolder(ctx.db, userId);
    if (!folder) return null;
    const notebook = await findNotebookInFolder(ctx.db, userId, folder._id, args.notebookTitle);
    if (!notebook) return null;
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebook._id))
      .collect();
    return {
      notebookId: notebook._id,
      docs: documents.map((d) => ({
        documentId: d._id,
        fileName: d.fileName,
        status: d.status,
        sha256: readSourceSha(d.metadata),
        error: d.error,
        totalChunks: d.totalChunks,
      })),
    };
  },
});

export const createPackNotebook = internalMutation({
  args: { ownerEmail: v.string(), notebookTitle: v.string() },
  returns: v.id("notebooks"),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const now = Date.now();
    const folderId =
      (await findEvalFolder(ctx.db, userId))?._id ??
      (await ctx.db.insert("folders", {
        userId,
        name: EVAL_PACK_FOLDER_NAME,
        icon: "Folder",
        createdAt: now,
        updatedAt: now,
      }));
    const existing = await findNotebookInFolder(ctx.db, userId, folderId, args.notebookTitle);
    if (existing) return existing._id;
    return await Notebooks.createNotebook(ctx, {
      userId,
      title: args.notebookTitle,
      icon: "Book",
      folderId,
    });
  },
});

export const insertPackDocument = internalMutation({
  args: {
    ownerEmail: v.string(),
    notebookId: v.id("notebooks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    sha256: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      throw new Error("Pack notebook not found for the eval owner.");
    }
    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId: args.notebookId,
      fileName: args.fileName,
      fileType: "file",
      fileSize: args.fileSize,
      storageId: args.storageId,
      contentType: args.contentType,
      status: "pending",
      metadata: { evalSourceSha256: args.sha256 },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
      documentId,
      userId,
      notebookId: args.notebookId,
    });
    return documentId;
  },
});

export const deletePackDocument = internalMutation({
  args: { ownerEmail: v.string(), documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    if (document.userId !== userId) {
      throw new Error("Refusing to delete a document the eval owner does not own.");
    }
    await deleteAllChunksForDocument(ctx, args.documentId);
    if (document.storageId) {
      await ctx.storage.delete(document.storageId as Id<"_storage">);
    }
    await ctx.db.delete(args.documentId);
    return null;
  },
});

export const packSourceText = internalQuery({
  args: { ownerEmail: v.string(), documentIds: v.array(v.id("documents")) },
  returns: packSourceTextValidator,
  handler: async (ctx, args) => {
    const userId = await ownerIdByEmail(ctx.db, args.ownerEmail);
    const texts: PackSourceText = [];
    for (const documentId of args.documentIds) {
      const document = await ctx.db.get(documentId);
      if (!document || document.userId !== userId) {
        throw new Error(`Document ${documentId} is not an eval pack document.`);
      }
      texts.push({
        fileName: document.fileName,
        text: (document.extractedMarkdown ?? "").slice(0, SOURCE_TEXT_MAX_CHARS),
      });
    }
    return texts;
  },
});
```

- [ ] **Step 3: Regenerate Convex types**

Run: `bun x convex codegen`
Expected: `convex/_generated/api.d.ts` gains `eval/_seedPack`. If codegen complains that no deployment is configured, the worktree is missing the repo-root `.env.local`. Ask the user to copy it from the main checkout: in their terminal, `copy "C:\Users\samin\Documents\GitHub\SolomindLM\.env.local" .env.local` (the harness blocks agents from writing `.env*` files). Then re-run. Never run `convex dev` or `convex deploy` here, because the dev deployment is shared with other sessions.

- [ ] **Step 4: Write the failing test**

Create `convex/eval/_seedPack.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const OWNER = "owner@example.com";

// Keep scheduled docEmbedding jobs from running (they call external services).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Owner" }));
  return { t, ownerId };
}

async function storeFile(t: ReturnType<typeof convexTest>, text: string) {
  return (await t.run((ctx) => ctx.storage.store(new Blob([text])))) as Id<"_storage">;
}

describe("findPackNotebook", () => {
  test("returns null when the Test folder does not exist", async () => {
    const { t } = await setup();
    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: "Language Learners",
    });
    expect(found).toBeNull();
  });

  test("throws when no user has the owner email", async () => {
    const { t } = await setup();
    await expect(
      t.query(internal.eval._seedPack.findPackNotebook, {
        ownerEmail: "nobody@example.com",
        notebookTitle: "Language Learners",
      })
    ).rejects.toThrow(/no user with email nobody@example.com/);
  });
});

describe("createPackNotebook", () => {
  test("creates the Test folder and notebook once", async () => {
    const { t, ownerId } = await setup();
    const args = { ownerEmail: OWNER, notebookTitle: "Language Learners" };
    const first = await t.mutation(internal.eval._seedPack.createPackNotebook, args);
    const second = await t.mutation(internal.eval._seedPack.createPackNotebook, args);
    expect(second).toBe(first);

    const { folders, notebook } = await t.run(async (ctx) => ({
      folders: await ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("userId", ownerId))
        .collect(),
      notebook: await ctx.db.get(first),
    }));
    expect(folders.map((f) => f.name)).toEqual(["Test"]);
    expect(notebook?.folderId).toBe(folders[0]._id);
    expect(notebook?.icon).toBe("Book");

    const found = await t.query(internal.eval._seedPack.findPackNotebook, args);
    expect(found).toEqual({ notebookId: first, docs: [] });
  });
});

describe("insertPackDocument / deletePackDocument", () => {
  test("inserts a pending document with its source hash, then deletes it and its file", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.eval._seedPack.createPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: "Language Learners",
    });
    const storageId = await storeFile(t, "# Unit 1");
    const documentId = await t.mutation(internal.eval._seedPack.insertPackDocument, {
      ownerEmail: OWNER,
      notebookId,
      storageId,
      fileName: "unit-1.md",
      contentType: "text/markdown",
      fileSize: 8,
      sha256: "abc123",
    });

    const found = await t.query(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: OWNER,
      notebookTitle: "Language Learners",
    });
    expect(found?.docs).toEqual([
      { documentId, fileName: "unit-1.md", status: "pending", sha256: "abc123" },
    ]);

    await t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId });
    const after = await t.run(async (ctx) => ({
      doc: await ctx.db.get(documentId),
      url: await ctx.storage.getUrl(storageId),
    }));
    expect(after).toEqual({ doc: null, url: null });
  });

  test("refuses notebooks and documents owned by someone else", async () => {
    const { t } = await setup();
    const otherId = await t.run((ctx) => ctx.db.insert("users", { email: "other@example.com" }));
    const { notebookId, documentId } = await t.run(async (ctx) => {
      const nb = await ctx.db.insert("notebooks", {
        userId: otherId,
        title: "Private",
        createdAt: 0,
        updatedAt: 0,
      });
      const doc = await ctx.db.insert("documents", {
        userId: otherId,
        notebookId: nb,
        fileName: "private.pdf",
        fileType: "file",
        status: "completed",
        createdAt: 0,
        updatedAt: 0,
      });
      return { notebookId: nb, documentId: doc };
    });
    const storageId = await storeFile(t, "x");

    await expect(
      t.mutation(internal.eval._seedPack.insertPackDocument, {
        ownerEmail: OWNER,
        notebookId,
        storageId,
        fileName: "x.md",
        contentType: "text/markdown",
        fileSize: 1,
        sha256: "x",
      })
    ).rejects.toThrow(/Pack notebook not found/);
    await expect(
      t.mutation(internal.eval._seedPack.deletePackDocument, { ownerEmail: OWNER, documentId })
    ).rejects.toThrow(/does not own/);
    await expect(
      t.query(internal.eval._seedPack.packSourceText, { ownerEmail: OWNER, documentIds: [documentId] })
    ).rejects.toThrow(/not an eval pack document/);
  });
});

describe("packSourceText", () => {
  test("returns extracted text capped at 50k chars", async () => {
    const { t, ownerId } = await setup();
    const documentId = await t.run(async (ctx) => {
      const nb = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Language Learners",
        createdAt: 0,
        updatedAt: 0,
      });
      return ctx.db.insert("documents", {
        userId: ownerId,
        notebookId: nb,
        fileName: "unit-1.pdf",
        fileType: "file",
        status: "completed",
        extractedMarkdown: "a".repeat(60_000),
        createdAt: 0,
        updatedAt: 0,
      });
    });
    const [text] = await t.query(internal.eval._seedPack.packSourceText, {
      ownerEmail: OWNER,
      documentIds: [documentId],
    });
    expect(text.fileName).toBe("unit-1.pdf");
    expect(text.text).toHaveLength(50_000);
  });
});
```

If the `notebooks` or `documents` inserts fail validation because the schema requires more fields, add the missing required fields shown by the error (check `convex/schema.ts`) and keep the test's intent.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `bun x vitest run --config vitest.convex.config.ts convex/eval/_seedPack.test.ts`
Expected: PASS (6 tests). (The test was written after the module here only because codegen needs the module to exist. If a test passes on its first run, briefly break the corresponding assertion to confirm it can fail, then restore it.)

- [ ] **Step 6: Typecheck and commit**

Run: `bun run typecheck:convex`
Expected: no errors.

```bash
bun x biome format --write convex/eval/_seedPack.ts convex/eval/_seedPack.test.ts convex/documents/index.ts
git add convex/eval/_seedPack.ts convex/eval/_seedPack.test.ts convex/documents/index.ts convex/_generated
git commit -m "feat(evals): internal Convex functions for use-case pack notebooks"
```

---

### Task 7: Gated seed actions

**Files:**
- Create: `convex/eval/seedEvalAction.ts`
- Test: `convex/eval/seedEvalAction.test.ts`

- [ ] **Step 1: Create `convex/eval/seedEvalAction.ts`**

```ts
/**
 * Gated actions for the use-case eval pack seeder (`bun run eval:seed`) and
 * the eval CLI's pack resolution. Same gate as the other eval actions
 * (RAG_EVALS_ENABLED + RAG_EVAL_SECRET, see `_gate.ts`). The notebook owner is
 * always RAG_EVAL_OWNER_EMAIL; callers never pass a user id.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { assertRagEvalGate } from "./_gate";
import {
  type PackNotebook,
  type PackSourceText,
  packNotebookValidator,
  packSourceTextValidator,
} from "./_seedPack";

function requireOwnerEmail(): string {
  const email = process.env.RAG_EVAL_OWNER_EMAIL?.trim();
  if (!email) {
    throw new Error(
      "RAG_EVAL_OWNER_EMAIL is not set on this deployment (email of the account that owns the eval pack notebooks)."
    );
  }
  return email;
}

export const resolvePackNotebook = action({
  args: { evalSecret: v.string(), notebookTitle: v.string() },
  returns: v.union(v.null(), packNotebookValidator),
  handler: async (ctx, args): Promise<PackNotebook | null> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.runQuery(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: requireOwnerEmail(),
      notebookTitle: args.notebookTitle,
    });
  },
});

export const createPackNotebook = action({
  args: { evalSecret: v.string(), notebookTitle: v.string() },
  returns: v.id("notebooks"),
  handler: async (ctx, args): Promise<Id<"notebooks">> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.runMutation(internal.eval._seedPack.createPackNotebook, {
      ownerEmail: requireOwnerEmail(),
      notebookTitle: args.notebookTitle,
    });
  },
});

export const getEvalUploadUrl = action({
  args: { evalSecret: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addPackDocument = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    sha256: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args): Promise<Id<"documents">> => {
    assertRagEvalGate(args.evalSecret);
    const { evalSecret: _secret, ...rest } = args;
    return await ctx.runMutation(internal.eval._seedPack.insertPackDocument, {
      ...rest,
      ownerEmail: requireOwnerEmail(),
    });
  },
});

export const removePackDocument = action({
  args: { evalSecret: v.string(), documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertRagEvalGate(args.evalSecret);
    await ctx.runMutation(internal.eval._seedPack.deletePackDocument, {
      ownerEmail: requireOwnerEmail(),
      documentId: args.documentId,
    });
    return null;
  },
});

export const getPackSourceText = action({
  args: { evalSecret: v.string(), documentIds: v.array(v.id("documents")) },
  returns: packSourceTextValidator,
  handler: async (ctx, args): Promise<PackSourceText> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.runQuery(internal.eval._seedPack.packSourceText, {
      ownerEmail: requireOwnerEmail(),
      documentIds: args.documentIds,
    });
  },
});
```

- [ ] **Step 2: Regenerate Convex types**

Run: `bun x convex codegen`
Expected: `api.eval.seedEvalAction.*` appears in `convex/_generated/api.d.ts`.

- [ ] **Step 3: Write the test**

Create `convex/eval/seedEvalAction.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const OWNER = "owner@example.com";
const SECRET = "s".repeat(24);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RAG_EVALS_ENABLED", "true");
  vi.stubEnv("RAG_EVAL_SECRET", SECRET);
  vi.stubEnv("RAG_EVAL_OWNER_EMAIL", OWNER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Owner" }));
  return t;
}

describe("seedEvalAction gate", () => {
  test("every action rejects a wrong secret", async () => {
    const t = await setup();
    const bad = "x".repeat(24);
    await expect(
      t.action(api.eval.seedEvalAction.resolvePackNotebook, { evalSecret: bad, notebookTitle: "A" })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.createPackNotebook, { evalSecret: bad, notebookTitle: "A" })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.getEvalUploadUrl, { evalSecret: bad })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.getPackSourceText, { evalSecret: bad, documentIds: [] })
    ).rejects.toThrow(/Invalid eval credentials/);
  });

  test("explains a missing RAG_EVAL_OWNER_EMAIL", async () => {
    const t = await setup();
    vi.stubEnv("RAG_EVAL_OWNER_EMAIL", "");
    await expect(
      t.action(api.eval.seedEvalAction.resolvePackNotebook, {
        evalSecret: SECRET,
        notebookTitle: "A",
      })
    ).rejects.toThrow(/RAG_EVAL_OWNER_EMAIL is not set/);
  });
});

describe("seedEvalAction round trip", () => {
  test("creates a pack notebook, adds and removes a document", async () => {
    const t = await setup();
    const notebookId = await t.action(api.eval.seedEvalAction.createPackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Medical Students",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["# Cardiology"])));
    const documentId = await t.action(api.eval.seedEvalAction.addPackDocument, {
      evalSecret: SECRET,
      notebookId,
      storageId,
      fileName: "cardiology.md",
      contentType: "text/markdown",
      fileSize: 12,
      sha256: "abc",
    });

    const resolved = await t.action(api.eval.seedEvalAction.resolvePackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Medical Students",
    });
    expect(resolved?.notebookId).toBe(notebookId);
    expect(resolved?.docs.map((d) => [d.documentId, d.sha256])).toEqual([[documentId, "abc"]]);

    await t.action(api.eval.seedEvalAction.removePackDocument, { evalSecret: SECRET, documentId });
    const after = await t.action(api.eval.seedEvalAction.resolvePackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Medical Students",
    });
    expect(after?.docs).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `bun x vitest run --config vitest.convex.config.ts convex/eval/seedEvalAction.test.ts`
Expected: PASS (3 tests). If `vi.stubEnv` values aren't visible inside actions, set `process.env` directly in `beforeEach` and restore it in `afterEach`.

- [ ] **Step 5: Typecheck and commit**

Run: `bun run typecheck:convex` (expected: no errors)

```bash
bun x biome format --write convex/eval/seedEvalAction.ts convex/eval/seedEvalAction.test.ts
git add convex/eval/seedEvalAction.ts convex/eval/seedEvalAction.test.ts convex/_generated
git commit -m "feat(evals): gated Convex actions for seeding use-case packs"
```

---

### Task 8: Seed orchestration

**Files:**
- Create: `evals/rag/usecases/seedClient.ts`
- Test: `evals/rag/usecases/seedClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/usecases/seedClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type PackSeedApi, seedPack } from "./seedClient";
import type { LocalSourceFile } from "./sources";
import type { RemotePackNotebook } from "./sync";
import type { SourceText, UseCasePack } from "./types";

const pack = { id: "medical-students", notebookTitle: "Medical Students" } as UseCasePack;

function file(fileName: string, sha256: string): LocalSourceFile {
  return { fileName, sha256, contentType: "text/markdown", bytes: new TextEncoder().encode(fileName) };
}

class FakeSeedApi implements PackSeedApi {
  calls: string[] = [];
  private nextId = 1;
  constructor(
    public notebook: RemotePackNotebook | null = null,
    /** Status that newly added documents report on the next resolve */
    public ingestTo: "completed" | "processing" | "failed" = "completed"
  ) {}
  async resolve(): Promise<RemotePackNotebook | null> {
    this.calls.push("resolve");
    return this.notebook ? { ...this.notebook, docs: this.notebook.docs.map((d) => ({ ...d })) } : null;
  }
  async create(title: string): Promise<string> {
    this.calls.push(`create:${title}`);
    this.notebook = { notebookId: "nb1", docs: [] };
    return "nb1";
  }
  async upload(f: LocalSourceFile): Promise<string> {
    this.calls.push(`upload:${f.fileName}`);
    return `st-${f.fileName}`;
  }
  async add(args: { notebookId: string; storageId: string; file: LocalSourceFile }): Promise<string> {
    this.calls.push(`add:${args.file.fileName}`);
    const documentId = `doc${this.nextId++}`;
    this.notebook?.docs.push({
      documentId,
      fileName: args.file.fileName,
      status: this.ingestTo,
      sha256: args.file.sha256,
      error: this.ingestTo === "failed" ? "OCR failed" : undefined,
      totalChunks: this.ingestTo === "completed" ? 4 : undefined,
    });
    return documentId;
  }
  async remove(documentId: string): Promise<void> {
    this.calls.push(`remove:${documentId}`);
    if (this.notebook) {
      this.notebook.docs = this.notebook.docs.filter((d) => d.documentId !== documentId);
    }
  }
  async sourceText(): Promise<SourceText[]> {
    return [];
  }
}

const fast = { pollMs: 0, sleep: async () => {} };

describe("seedPack", () => {
  it("creates the notebook and uploads every source when nothing exists", async () => {
    const api = new FakeSeedApi();
    const result = await seedPack(pack, [file("a.md", "1"), file("b.md", "2")], api, fast);
    expect(api.calls).toEqual([
      "resolve",
      "create:Medical Students",
      "upload:a.md",
      "add:a.md",
      "upload:b.md",
      "add:b.md",
      "resolve",
    ]);
    expect(result).toMatchObject({ notebookId: "nb1", documentIds: ["doc1", "doc2"], totalChunks: 8 });
  });

  it("does nothing for sources that are already current", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "1" }],
    });
    await seedPack(pack, [file("a.md", "1")], api, fast);
    expect(api.calls).toEqual(["resolve", "resolve"]);
  });

  it("replaces a changed source", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "old" }],
    });
    await seedPack(pack, [file("a.md", "new")], api, fast);
    expect(api.calls).toEqual(["resolve", "remove:d1", "upload:a.md", "add:a.md", "resolve"]);
  });

  it("fails with the ingestion error when a document fails", async () => {
    const api = new FakeSeedApi(null, "failed");
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "medical-students: ingestion failed — a.md: OCR failed"
    );
  });

  it("times out listing what is still pending", async () => {
    const api = new FakeSeedApi(null, "processing");
    let clock = 0;
    await expect(
      seedPack(pack, [file("a.md", "1")], api, {
        pollMs: 1000,
        timeoutMs: 3000,
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      })
    ).rejects.toThrow("medical-students: timed out waiting for ingestion — a.md: processing");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/seedClient.test.ts`
Expected: FAIL (cannot resolve `./seedClient`).

- [ ] **Step 3: Create `evals/rag/usecases/seedClient.ts`**

```ts
import type { LocalSourceFile } from "./sources";
import { checkPackReady, planPackSync, type RemotePackNotebook, type SyncAction } from "./sync";
import type { SourceText, UseCasePack } from "./types";

/** Operations the seeder needs; implemented over Convex in convexSeedApi.ts. */
export interface PackSeedApi {
  resolve(notebookTitle: string): Promise<RemotePackNotebook | null>;
  create(notebookTitle: string): Promise<string>;
  /** Upload file bytes to storage; returns the storage id */
  upload(file: LocalSourceFile): Promise<string>;
  add(args: { notebookId: string; storageId: string; file: LocalSourceFile }): Promise<string>;
  remove(documentId: string): Promise<void>;
  sourceText(documentIds: string[]): Promise<SourceText[]>;
}

export interface SeedPackOptions {
  pollMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
}

export interface SeedPackResult {
  notebookId: string;
  documentIds: string[];
  actions: SyncAction[];
  totalChunks: number;
}

const DEFAULT_POLL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/** Sync a pack's committed sources into its notebook and wait for ingestion. */
export async function seedPack(
  pack: UseCasePack,
  local: LocalSourceFile[],
  api: PackSeedApi,
  options: SeedPackOptions = {}
): Promise<SeedPackResult> {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});

  const existing = await api.resolve(pack.notebookTitle);
  const notebookId = existing?.notebookId ?? (await api.create(pack.notebookTitle));
  const actions = planPackSync(local, existing?.docs ?? []);

  for (const action of actions) {
    if (action.kind === "skip") continue;
    if (action.kind === "replace") {
      log(`  replace ${action.fileName} (${action.reason})`);
      await api.remove(action.documentId);
    } else {
      log(`  upload ${action.fileName}`);
    }
    const file = local.find((f) => f.fileName === action.fileName);
    if (!file) throw new Error(`${pack.id}: planned ${action.fileName} but it was not read`);
    const storageId = await api.upload(file);
    await api.add({ notebookId, storageId, file });
  }

  const deadline = now() + timeoutMs;
  for (;;) {
    const remote = await api.resolve(pack.notebookTitle);
    const readiness = checkPackReady(pack, local, remote);
    if (readiness.problems.length === 0 && remote) {
      const packDocs = remote.docs.filter((d) => readiness.documentIds.includes(d.documentId));
      return {
        notebookId,
        documentIds: readiness.documentIds,
        actions,
        totalChunks: packDocs.reduce((sum, d) => sum + (d.totalChunks ?? 0), 0),
      };
    }
    const failed = (remote?.docs ?? []).filter(
      (d) => d.status === "failed" && local.some((f) => f.fileName === d.fileName)
    );
    if (failed.length > 0) {
      const detail = failed.map((d) => `${d.fileName}: ${d.error ?? "unknown error"}`).join("; ");
      throw new Error(`${pack.id}: ingestion failed — ${detail}`);
    }
    if (now() >= deadline) {
      throw new Error(
        `${pack.id}: timed out waiting for ingestion — ${readiness.problems.join("; ")}`
      );
    }
    await sleep(pollMs);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/seedClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
bun x biome format --write evals/rag/usecases
git add evals/rag/usecases
git commit -m "feat(evals): seed use-case pack sources and wait for ingestion"
```

---

### Task 9: Convex seed API and `eval:seed` CLI

**Files:**
- Create: `evals/rag/usecases/convexSeedApi.ts`, `evals/rag/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `evals/rag/usecases/convexSeedApi.ts`**

```ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PackSeedApi } from "./seedClient";

/** PackSeedApi over the gated actions in convex/eval/seedEvalAction.ts. */
export function createConvexSeedApi(convexUrl: string, evalSecret: string): PackSeedApi {
  const client = new ConvexHttpClient(convexUrl);
  return {
    resolve: (notebookTitle) =>
      client.action(api.eval.seedEvalAction.resolvePackNotebook, { evalSecret, notebookTitle }),
    create: (notebookTitle) =>
      client.action(api.eval.seedEvalAction.createPackNotebook, { evalSecret, notebookTitle }),
    upload: async (file) => {
      const uploadUrl = await client.action(api.eval.seedEvalAction.getEvalUploadUrl, { evalSecret });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.contentType },
        body: new Blob([file.bytes], { type: file.contentType }),
      });
      if (!response.ok) {
        throw new Error(`Upload of ${file.fileName} failed: HTTP ${response.status}`);
      }
      const { storageId } = (await response.json()) as { storageId: string };
      return storageId;
    },
    add: ({ notebookId, storageId, file }) =>
      client.action(api.eval.seedEvalAction.addPackDocument, {
        evalSecret,
        notebookId: notebookId as Id<"notebooks">,
        storageId: storageId as Id<"_storage">,
        fileName: file.fileName,
        contentType: file.contentType,
        fileSize: file.bytes.byteLength,
        sha256: file.sha256,
      }),
    remove: async (documentId) => {
      await client.action(api.eval.seedEvalAction.removePackDocument, {
        evalSecret,
        documentId: documentId as Id<"documents">,
      });
    },
    sourceText: (documentIds) =>
      client.action(api.eval.seedEvalAction.getPackSourceText, {
        evalSecret,
        documentIds: documentIds as Id<"documents">[],
      }),
  };
}
```

- [ ] **Step 2: Create `evals/rag/seed.ts`**

```ts
/**
 * Sync use-case pack sources into the eval owner's notebooks (Test folder).
 *
 * Usage:
 *   bun run eval:seed                          # every registered pack
 *   bun run eval:seed -- --use-case language-learners,medical-students
 *
 * Needs RAG_EVAL_CONVEX_URL + RAG_EVAL_SECRET locally, and on the deployment:
 * RAG_EVALS_ENABLED=true, RAG_EVAL_SECRET, RAG_EVAL_OWNER_EMAIL.
 */
import { getPack, USE_CASE_PACKS } from "./usecases";
import { createConvexSeedApi } from "./usecases/convexSeedApi";
import { assertNotProdConvexUrl } from "./usecases/prodGuard";
import { seedPack } from "./usecases/seedClient";
import { readPackSources } from "./usecases/sources";

function selectedPackIds(args: string[]): string[] {
  const index = args.indexOf("--use-case");
  if (index === -1) return USE_CASE_PACKS.map((p) => p.pack.id);
  const value = args[index + 1] ?? "";
  if (value === "all") return USE_CASE_PACKS.map((p) => p.pack.id);
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const convexUrl = process.env.RAG_EVAL_CONVEX_URL?.trim();
  const evalSecret = process.env.RAG_EVAL_SECRET?.trim();
  if (!convexUrl || !evalSecret) {
    console.error("FATAL: set RAG_EVAL_CONVEX_URL and RAG_EVAL_SECRET (see evals/rag/env.eval.example).");
    process.exit(2);
  }
  assertNotProdConvexUrl(convexUrl, process.env.CONVEX_DEPLOYMENT);

  const packIds = selectedPackIds(process.argv.slice(2));
  if (packIds.length === 0) {
    console.log("No use-case packs registered (evals/rag/usecases/index.ts). Nothing to seed.");
    return;
  }

  const api = createConvexSeedApi(convexUrl, evalSecret);
  let failures = 0;
  for (const id of packIds) {
    const registered = getPack(id);
    console.log(`[${id}] → "${registered.pack.notebookTitle}"`);
    try {
      const result = await seedPack(registered.pack, readPackSources(registered), api, {
        log: (line) => console.log(line),
      });
      const changed = result.actions.filter((a) => a.kind !== "skip").length;
      console.log(
        `  ready: notebook ${result.notebookId}, ${result.documentIds.length} doc(s), ` +
          `${result.totalChunks} chunk(s), ${changed} changed`
      );
    } catch (err) {
      failures++;
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
```

- [ ] **Step 3: Add scripts to `package.json`**

After the `"eval:literature-review:dry"` line add:

```json
    "eval:seed": "bun --env-file=.env run evals/rag/seed.ts",
    "eval:usecases": "bun --env-file=.env run evals/rag/cli.ts --use-case all --split smoke",
    "eval:usecases:dry": "bun run evals/rag/cli.ts --dry-run --use-case all",
```

- [ ] **Step 4: Smoke-run the seed CLI**

Run: `bun run eval:seed`
Expected (no packs registered yet): `No use-case packs registered (evals/rag/usecases/index.ts). Nothing to seed.`
If `.env` is missing in the worktree, Bun errors on `--env-file`. In that case run `bun run evals/rag/seed.ts` with no env: it should exit 2 with the FATAL env message. Either result shows the entry point loads.

- [ ] **Step 5: Commit**

```bash
bun x biome format --write evals/rag/seed.ts evals/rag/usecases package.json
git add evals/rag/seed.ts evals/rag/usecases package.json
git commit -m "feat(evals): add eval:seed for use-case packs"
```

---

### Task 10: Run-time pack resolution

**Files:**
- Create: `evals/rag/usecases/resolve.ts`
- Test: `evals/rag/usecases/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/usecases/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import {
  applyPackResolution,
  formatPlannedJobs,
  PackNotReadyError,
  resolvePackReadiness,
} from "./resolve";
import type { PackReadiness } from "./sync";
import type { UseCasePack } from "./types";

function fixture(id: string, useCase: string | undefined, runner: EvalFixture["runner"]): EvalFixture {
  return {
    schemaVersion: 1,
    id,
    question: "q",
    expectedItems: [],
    expectedBehavior: "b",
    runner,
    tags: [],
    useCase,
    notebookId: useCase ? undefined : "legacy-nb",
  };
}

const ready: PackReadiness = {
  useCase: "language-learners",
  notebookId: "nb-lang",
  documentIds: ["d1", "d2"],
  problems: [],
};

describe("applyPackResolution", () => {
  it("pins pack fixtures to the pack notebook and documents; leaves others alone", () => {
    const [pack, legacy] = applyPackResolution(
      [fixture("language-learners/a", "language-learners", "flashcards"), fixture("ml-x", undefined, "chat")],
      new Map([["language-learners", ready]])
    );
    expect(pack.notebookId).toBe("nb-lang");
    expect(pack.documentIds).toEqual(["d1", "d2"]);
    expect(legacy.notebookId).toBe("legacy-nb");
  });

  it("throws PackNotReadyError naming the seed command", () => {
    const notReady: PackReadiness = {
      useCase: "medical-students",
      notebookId: null,
      documentIds: [],
      problems: ['notebook "Medical Students" not found in the Test folder'],
    };
    const run = () =>
      applyPackResolution(
        [fixture("medical-students/a", "medical-students", "quiz")],
        new Map([["medical-students", notReady]])
      );
    expect(run).toThrow(PackNotReadyError);
    expect(run).toThrow(/bun run eval:seed --use-case medical-students/);
  });
});

describe("resolvePackReadiness", () => {
  it("resolves each pack once through the API", async () => {
    const titles: string[] = [];
    const pack = { id: "language-learners", notebookTitle: "Language Learners" } as UseCasePack;
    const result = await resolvePackReadiness([{ pack, local: [{ fileName: "a.md", sha256: "1" }] }], {
      resolve: async (title) => {
        titles.push(title);
        return {
          notebookId: "nb",
          docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "1" }],
        };
      },
    });
    expect(titles).toEqual(["Language Learners"]);
    expect(result.get("language-learners")).toEqual({
      useCase: "language-learners",
      notebookId: "nb",
      documentIds: ["d1"],
      problems: [],
    });
  });
});

describe("formatPlannedJobs", () => {
  it("counts jobs per pack and runner", () => {
    expect(
      formatPlannedJobs([
        fixture("language-learners/a", "language-learners", "flashcards"),
        fixture("language-learners/b", "language-learners", "flashcards"),
        fixture("language-learners/c", "language-learners", "quiz"),
        fixture("ml-x", undefined, "chat"),
      ])
    ).toBe("  language-learners: flashcards×2 quiz×1");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/resolve.test.ts`
Expected: FAIL (cannot resolve `./resolve`).

- [ ] **Step 3: Create `evals/rag/usecases/resolve.ts`**

```ts
import type { EvalFixture } from "../types";
import type { PackSeedApi } from "./seedClient";
import type { SourceDigest } from "./sources";
import { checkPackReady, type PackReadiness } from "./sync";
import type { UseCasePack } from "./types";

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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/usecases/resolve.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
bun x biome format --write evals/rag/usecases
git add evals/rag/usecases
git commit -m "feat(evals): resolve use-case pack notebooks before a run"
```

---

### Task 11: CLI `--use-case` integration

**Files:**
- Modify: `evals/rag/cli.ts`

This task is CLI glue over tested units. Verify it with dry runs, not unit tests.

- [ ] **Step 1: Imports**

Add to the imports in `evals/rag/cli.ts` (Biome sorts them on format):

```ts
import { getPack, USE_CASE_PACKS } from "./usecases";
import { createConvexSeedApi } from "./usecases/convexSeedApi";
import {
  applyPackResolution,
  formatPlannedJobs,
  PackNotReadyError,
  resolvePackReadiness,
} from "./usecases/resolve";
import type { PackSeedApi } from "./usecases/seedClient";
import { readPackSources } from "./usecases/sources";
import type { SourceText } from "./usecases/types";
```

- [ ] **Step 2: Option, parser, flag and help text**

In `interface CliOptions`, after `split?: EvalSplit;` add:

```ts
  /** Restrict to use-case pack fixtures (ids from evals/rag/usecases) */
  useCases?: string[];
```

After `function parseRunners(...) { ... }` add:

```ts
function parseUseCases(value: string): string[] {
  const known = USE_CASE_PACKS.map((p) => p.pack.id);
  if (value.trim() === "all") return known;
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!known.includes(id)) {
      throw new Error(`Unknown use case "${id}". Registered: ${known.join(", ") || "(none)"}`);
    }
  }
  return ids;
}
```

In `parseArgs`, after the `case "--runner":` block add:

```ts
      case "--use-case":
        opts.useCases = parseUseCases(args[++i]);
        break;
```

In `printHelp`, after the `--split` line add:

```
  --use-case <ids|all>     Use-case pack fixtures only (seed first: bun run eval:seed)
```

- [ ] **Step 3: Filter fixtures**

In `main`, inside the `else` branch that builds `fixtureIds`, after the `if (opts.split) { ... }` block add:

```ts
    if (opts.useCases) {
      const allowed = new Set(opts.useCases);
      fixtureIds = fixtureIds.filter((id) => {
        const useCase = getFixture(id).useCase;
        return useCase !== undefined && allowed.has(useCase);
      });
    }
```

- [ ] **Step 4: Create the seed API in real mode**

Next to `let studioInvokers: ...` add:

```ts
  let seedApi: PackSeedApi | undefined;
```

Inside the `if (!opts.dryRun) { ... }` block, after `studioInvokers = createConvexStudioInvokers(convexUrl, { evalSecret });` add:

```ts
    seedApi = createConvexSeedApi(convexUrl, evalSecret);
```

- [ ] **Step 5: Resolve packs before running**

Directly after the `for (const id of fixtureIds) { ... expandedFixtures.push(...) }` loop and before `for (const fixture of expandedFixtures) {`, add:

```ts
  // Use-case packs: resolve seeded notebooks before any job runs, so an
  // unseeded pack costs nothing (spec §3).
  let fixturesToRun = expandedFixtures;
  const packSourceTexts = new Map<string, SourceText[]>();
  const packIds = [...new Set(expandedFixtures.flatMap((f) => (f.useCase ? [f.useCase] : [])))];
  if (packIds.length > 0) {
    console.log(`Planned use-case jobs:\n${formatPlannedJobs(expandedFixtures)}\n`);
    if (seedApi) {
      const readiness = await resolvePackReadiness(
        packIds.map((id) => {
          const registered = getPack(id);
          return { pack: registered.pack, local: readPackSources(registered) };
        }),
        seedApi
      );
      try {
        fixturesToRun = applyPackResolution(expandedFixtures, readiness);
      } catch (err) {
        if (err instanceof PackNotReadyError) {
          console.error(err.message);
          process.exit(2);
        }
        throw err;
      }
      for (const [id, resolved] of readiness) {
        packSourceTexts.set(id, await seedApi.sourceText(resolved.documentIds));
      }
    }
  }
```

Change the run loop header from `for (const fixture of expandedFixtures) {` to:

```ts
  for (const fixture of fixturesToRun) {
```

- [ ] **Step 6: Tag artifacts, pass source text, build the report map**

Inside `for (const { artifact, errors } of results) {`, as its first line add:

```ts
      artifact.useCase = fixture.useCase;
```

In the `scoreAllMetrics(fixture, artifact, baseline, { ... })` options object, add:

```ts
        packSourceTexts: fixture.useCase ? packSourceTexts.get(fixture.useCase) : undefined,
```

(`packSourceTexts` is added to `ScoreAllMetricsOptions` in Task 12. Until then this line fails typechecks, so do Task 12 before running typecheck on the CLI.)

In the `generateReport(allMetrics, { ... })` options object, add:

```ts
    useCaseByCase: new Map(
      fixturesToRun.flatMap((f): [string, string][] => (f.useCase ? [[f.id, f.useCase]] : []))
    ),
```

(`useCaseByCase` is added in Task 13.)

- [ ] **Step 7: Commit (after Tasks 12 and 13 compile)**

Hold this commit until Task 13, Step 6, then commit the CLI together with the scorecard (see Task 13).

---

### Task 12: Rubric judges

**Files:**
- Create: `evals/rag/metrics/rubric.ts`
- Modify: `evals/rag/metrics/scorers.ts`, `evals/rag/reports/judgeQueue.ts`
- Test: `evals/rag/metrics/rubric.test.ts`, `evals/rag/reports/judgeQueue.test.ts`

- [ ] **Step 1: Check PR #209**

Run: `gh pr view 209 --json state,files --jq '.state, [.files[].path]'`
If it's merged, sync with main first, because it may change `parseBinaryResponse` in `evals/rag/metrics/binaryJudges.ts`. The rubric code only calls `parseBinaryResponse(raw)` and uses `{ pass, reason }`. If #209 changed that export's name or shape, adapt the one call in Step 3.

- [ ] **Step 2: Write the failing test**

Create `evals/rag/metrics/rubric.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import type { UseCasePack } from "../usecases/types";
import { buildRubricPrompt, formatSourceTexts, rubricMetricName, scoreRubricMetrics } from "./rubric";

const pack: UseCasePack = {
  id: "professionals",
  title: "Professionals",
  notebookTitle: "Professionals",
  advertisedClaim: "Summarize industry reports",
  features: ["report", "quiz"],
  sources: ["q3.pdf"],
  rubric: [
    { id: "figures-match", question: "Does every figure match the source?", appliesTo: ["report"], evidence: "sources" },
    { id: "conclusion-first", question: "Does it lead with the conclusion?", appliesTo: ["report"], evidence: "output" },
    { id: "quiz-only", question: "Quiz check?", appliesTo: ["quiz"], evidence: "output" },
  ],
};

const fixture = { id: "professionals/report-01", question: "Summarize the Q3 report" } as EvalFixture;

function artifact(overrides: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "professionals/report-01",
    runner: "report",
    configHash: "h",
    answer: "Revenue grew 12%.",
    selectedChunks: [],
    ...overrides,
  } as EvalRunArtifact;
}

describe("rubric prompts", () => {
  it("names metrics rubric:<pack>:<check>", () => {
    expect(rubricMetricName("professionals", "figures-match")).toBe("rubric:professionals:figures-match");
  });

  it("splits the source budget evenly across documents", () => {
    const text = formatSourceTexts(
      [
        { fileName: "a.pdf", text: "x".repeat(100) },
        { fileName: "b.pdf", text: "y".repeat(100) },
      ],
      20
    );
    expect(text).toBe(`[a.pdf]\n${"x".repeat(10)}\n\n---\n\n[b.pdf]\n${"y".repeat(10)}`);
  });

  it("includes source text only for evidence: sources, preferring retrieved chunks", () => {
    const sources = [{ fileName: "q3.pdf", text: "Revenue grew 12% in Q3." }];
    const withSources = buildRubricPrompt(pack, pack.rubric[0], fixture, artifact(), sources);
    expect(withSources).toContain("Does every figure match the source?");
    expect(withSources).toContain("[q3.pdf]\nRevenue grew 12% in Q3.");
    expect(withSources).toContain("Revenue grew 12%.");

    const withChunks = buildRubricPrompt(
      pack,
      pack.rubric[0],
      fixture,
      artifact({ selectedChunks: [{ id: "c", sourceTitle: "chunk-src", content: "chunk text" }] }),
      sources
    );
    expect(withChunks).toContain("[chunk-src]\nchunk text");
    expect(withChunks).not.toContain("[q3.pdf]");

    const outputOnly = buildRubricPrompt(pack, pack.rubric[1], fixture, artifact(), sources);
    expect(outputOnly).not.toContain("Source excerpts:");
  });
});

describe("scoreRubricMetrics", () => {
  it("runs only checks for the artifact's runner and maps verdicts", async () => {
    const verdicts = [
      '{"pass": true, "reason": "all figures match"}',
      '{"pass": false, "reason": "buries the conclusion"}',
    ];
    const results = await scoreRubricMetrics(fixture, artifact(), pack, {
      invoke: async () => verdicts.shift() ?? "",
      model: "judge-model",
    });
    expect(results.map((r) => [r.metric, r.status, r.detail])).toEqual([
      ["rubric:professionals:figures-match", "pass", "all figures match"],
      ["rubric:professionals:conclusion-first", "fail", "buries the conclusion"],
    ]);
    expect(results[0]).toMatchObject({ caseId: "professionals/report-01", runner: "report", score: 1 });
  });

  it("tags judge failures as judgeError instead of a quality verdict", async () => {
    const [result] = await scoreRubricMetrics(
      fixture,
      artifact(),
      { ...pack, rubric: [pack.rubric[1]] },
      {
        invoke: async () => "We need to think about this…",
        model: "judge-model",
      }
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/^Rubric judge failed:/);
    expect(result.breakdown).toMatchObject({ judgeError: true });
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails, then create `evals/rag/metrics/rubric.ts`**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/metrics/rubric.test.ts` → FAIL (cannot resolve `./rubric`).

```ts
/**
 * Per-use-case rubric judges (spec §4). One binary verdict per applicable
 * RubricCheck, named `rubric:<pack>:<check>`. Rubric text lives in eval code
 * only and must never be copied into production prompts.
 */
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { RubricCheck, SourceText, UseCasePack } from "../usecases/types";
import { parseBinaryResponse } from "./binaryJudges";

const OUTPUT_LIMIT = 10_000;
const SOURCES_LIMIT = 12_000;

export interface RubricJudgeOptions {
  invoke: (prompt: string) => Promise<string>;
  model: string;
  /** Pack source text, used when the artifact has no retrieved chunks (studio runners) */
  sourceTexts?: SourceText[];
}

export function rubricMetricName(packId: string, checkId: string): string {
  return `rubric:${packId}:${checkId}`;
}

/** Split `limit` chars evenly across documents. */
export function formatSourceTexts(texts: SourceText[], limit: number): string {
  if (texts.length === 0) return "";
  const perDoc = Math.floor(limit / texts.length);
  return texts.map((t) => `[${t.fileName}]\n${t.text.slice(0, perDoc)}`).join("\n\n---\n\n");
}

function sourceEvidence(artifact: EvalRunArtifact, sourceTexts: SourceText[]): string {
  if (artifact.selectedChunks.length > 0) {
    return artifact.selectedChunks
      .map((c) => `[${c.sourceTitle}]\n${c.content}`)
      .join("\n\n---\n\n")
      .slice(0, SOURCES_LIMIT);
  }
  return formatSourceTexts(sourceTexts, SOURCES_LIMIT);
}

export function buildRubricPrompt(
  pack: UseCasePack,
  check: RubricCheck,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  sourceTexts: SourceText[] = []
): string {
  const lines = [
    `You are checking an AI-generated ${artifact.runner} output made for ${pack.title}.`,
    "",
    `User request: ${fixture.question}`,
    "",
    `Check: ${check.question}`,
    "",
  ];
  if (check.evidence === "sources") {
    lines.push(
      "Source excerpts:",
      sourceEvidence(artifact, sourceTexts) || "(no source excerpts recorded)",
      ""
    );
  }
  lines.push(
    "Output:",
    artifact.answer.slice(0, OUTPUT_LIMIT),
    "",
    "Answer the check for the output as a whole. Pass only if the answer is yes.",
    'Respond JSON only: {"pass": boolean, "reason": string}'
  );
  return lines.join("\n");
}

export async function scoreRubricMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  pack: UseCasePack,
  options: RubricJudgeOptions
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  for (const check of pack.rubric.filter((c) => c.appliesTo.includes(artifact.runner))) {
    const base = {
      metric: rubricMetricName(pack.id, check.id),
      caseId: fixture.id,
      runner: artifact.runner,
      configHash: artifact.configHash,
    };
    try {
      const raw = await options.invoke(
        buildRubricPrompt(pack, check, fixture, artifact, options.sourceTexts)
      );
      const { pass, reason } = parseBinaryResponse(raw);
      results.push({
        ...base,
        status: pass ? "pass" : "fail",
        score: pass ? 1 : 0,
        detail: reason,
        breakdown: { model: options.model, pass, check: check.question },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        ...base,
        status: "fail",
        score: 0,
        detail: `Rubric judge failed: ${message}`,
        breakdown: { model: options.model, judgeError: true, error: message, check: check.question },
      });
    }
  }
  return results;
}
```

Run the test again → PASS (6 tests).

- [ ] **Step 4: Wire into `scoreAllMetrics`**

In `evals/rag/metrics/scorers.ts`:

Add imports:

```ts
import { getPack } from "../usecases";
import type { SourceText } from "../usecases/types";
import { scoreRubricMetrics } from "./rubric";
```

In `interface ScoreAllMetricsOptions` add:

```ts
  /** Extracted pack source text for rubric judges (use-case pack fixtures) */
  packSourceTexts?: SourceText[];
```

Directly after `results.push(...binaryResults);` add:

```ts
  if (fixture.useCase && binaryOptions.enabled && invoke) {
    results.push(
      ...(await scoreRubricMetrics(fixture, artifact, getPack(fixture.useCase).pack, {
        invoke,
        model: options.judgeModel ?? DEFAULT_JUDGE_MODEL,
        sourceTexts: options.packSourceTexts,
      }))
    );
  }
```

- [ ] **Step 5: Include rubric verdicts in the judge calibration queue**

Add this test to `evals/rag/reports/judgeQueue.test.ts` inside `describe("buildJudgeCalibrationQueue", ...)`:

```ts
  it("includes rubric verdicts alongside binary judges", () => {
    const queue = buildJudgeCalibrationQueue(
      [
        metric({ metric: "rubric:professionals:figures-match", status: "fail" }),
        metric({ metric: "binary_judge_studio_grounding", status: "pass", runner: "report" }),
      ],
      { limit: 20 }
    );
    expect(queue.map((row) => row.metric)).toEqual([
      "rubric:professionals:figures-match",
      "binary_judge_studio_grounding",
    ]);
  });
```

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/reports/judgeQueue.test.ts` → FAIL (the rubric row is filtered out).

In `evals/rag/reports/judgeQueue.ts`, change:

```ts
  const judges = metrics.filter((row) => row.metric.startsWith("binary_judge_"));
```

to:

```ts
  const judges = metrics.filter(
    (row) => row.metric.startsWith("binary_judge_") || row.metric.startsWith("rubric:")
  );
```

Also update the first existing test's assertion `expect(queue.every((row) => row.metric.startsWith("binary_judge_"))).toBe(true);`. It stays correct because that test has no rubric rows, so leave it unchanged.

Run the judgeQueue test again → PASS.

- [ ] **Step 6: Run the metric and report tests, then commit**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/metrics evals/rag/reports`
Expected: PASS.

```bash
bun x biome format --write evals/rag/metrics evals/rag/reports/judgeQueue.ts evals/rag/reports/judgeQueue.test.ts
git add evals/rag/metrics evals/rag/reports/judgeQueue.ts evals/rag/reports/judgeQueue.test.ts
git commit -m "feat(evals): per-use-case rubric judges"
```

---

### Task 13: Scorecard

**Files:**
- Create: `evals/rag/reports/scorecard.ts`
- Modify: `evals/rag/types.ts` (`EvalReport`), `evals/rag/reports/reportGenerator.ts`, `evals/rag/reports/index.ts`
- Test: `evals/rag/reports/scorecard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/reports/scorecard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MetricResult } from "../types";
import { buildScorecard, formatScorecard, isJudgeError } from "./scorecard";
import { formatReport, generateReport } from "./reportGenerator";

function m(partial: Partial<MetricResult> & Pick<MetricResult, "metric" | "status" | "caseId">): MetricResult {
  return { runner: "flashcards", configHash: "h", score: partial.status === "pass" ? 1 : 0, detail: "", ...partial };
}

const useCaseByCase = new Map([
  ["language-learners/a", "language-learners"],
  ["language-learners/b", "language-learners"],
]);

const metrics: MetricResult[] = [
  m({ caseId: "language-learners/a", metric: "flashcard_card_validity", status: "pass" }),
  m({ caseId: "language-learners/a", metric: "rubric:language-learners:one-item", status: "fail" }),
  m({ caseId: "language-learners/b", metric: "rubric:language-learners:one-item", status: "fail" }),
  m({
    caseId: "language-learners/b",
    metric: "binary_judge_studio_grounding",
    status: "fail",
    breakdown: { error: "JSON Parse error" },
  }),
  m({ caseId: "language-learners/b", metric: "latency_cost_budget", status: "info" }),
  m({ caseId: "language-learners/a", metric: "quiz_option_validity", status: "pass", runner: "quiz" }),
  m({ caseId: "ml-x", metric: "binary_judge_chat_grounding", status: "fail", runner: "chat" }),
];

describe("isJudgeError", () => {
  it("recognises binary-judge and rubric failures without a verdict", () => {
    expect(isJudgeError(metrics[3])).toBe(true);
    expect(
      isJudgeError(m({ caseId: "x", metric: "rubric:p:c", status: "fail", breakdown: { judgeError: true } }))
    ).toBe(true);
    expect(isJudgeError(metrics[1])).toBe(false);
    expect(
      isJudgeError(m({ caseId: "x", metric: "expected_item_recall", status: "fail", breakdown: { error: "x" } }))
    ).toBe(false);
  });
});

describe("buildScorecard", () => {
  it("aggregates pass/fail per pack × runner, keeping judge errors apart", () => {
    expect(buildScorecard(metrics, useCaseByCase).cells).toEqual([
      {
        useCase: "language-learners",
        runner: "flashcards",
        pass: 1,
        fail: 2,
        judgeErrors: 1,
        passRate: 1 / 3,
        failedChecks: ["rubric:language-learners:one-item"],
      },
      {
        useCase: "language-learners",
        runner: "quiz",
        pass: 1,
        fail: 0,
        judgeErrors: 0,
        passRate: 1,
        failedChecks: [],
      },
    ]);
  });
});

describe("scorecard in reports", () => {
  it("formats cells and is attached and printed by the report", () => {
    const scorecard = buildScorecard(metrics, useCaseByCase);
    expect(formatScorecard(scorecard)).toEqual([
      "  Use-case scorecard:",
      "    language-learners",
      "      flashcards  33% (1/3)  judge errors: 1  failing: rubric:language-learners:one-item",
      "      quiz  100% (1/1)",
      "",
    ]);
    const report = generateReport(metrics, { commitSha: "abc12345", useCaseByCase });
    expect(report.scorecard?.cells).toHaveLength(2);
    expect(formatReport(report)).toContain("Use-case scorecard:");
  });

  it("omits the scorecard when no pack fixtures ran", () => {
    const report = generateReport(metrics, { commitSha: "abc12345" });
    expect(report.scorecard).toBeUndefined();
    expect(formatReport(report)).not.toContain("Use-case scorecard:");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/reports/scorecard.test.ts`
Expected: FAIL (cannot resolve `./scorecard`).

- [ ] **Step 3: Create `evals/rag/reports/scorecard.ts`**

```ts
import type { ConcreteRunnerKind, MetricResult } from "../types";

export interface ScorecardCell {
  useCase: string;
  runner: ConcreteRunnerKind;
  pass: number;
  fail: number;
  judgeErrors: number;
  /** pass / (pass + fail); null when nothing was scored */
  passRate: number | null;
  /** Metric names that failed (judge errors excluded) */
  failedChecks: string[];
}

export interface Scorecard {
  cells: ScorecardCell[];
}

/** A judge metric that failed to produce a verdict (truncation, parse or HTTP error). */
export function isJudgeError(m: MetricResult): boolean {
  const isJudge = m.metric.startsWith("binary_judge_") || m.metric.startsWith("rubric:");
  if (!isJudge) return false;
  return m.breakdown?.judgeError === true || typeof m.breakdown?.error === "string";
}

/** Pass rates per use-case pack × runner (pass/fail metrics only). */
export function buildScorecard(
  metrics: MetricResult[],
  useCaseByCase: Map<string, string>
): Scorecard {
  const cells = new Map<string, ScorecardCell>();
  for (const metric of metrics) {
    const useCase = useCaseByCase.get(metric.caseId);
    if (!useCase || (metric.status !== "pass" && metric.status !== "fail")) continue;
    const key = `${useCase}::${metric.runner}`;
    const cell = cells.get(key) ?? {
      useCase,
      runner: metric.runner,
      pass: 0,
      fail: 0,
      judgeErrors: 0,
      passRate: null,
      failedChecks: [],
    };
    if (isJudgeError(metric)) {
      cell.judgeErrors++;
    } else if (metric.status === "pass") {
      cell.pass++;
    } else {
      cell.fail++;
      if (!cell.failedChecks.includes(metric.metric)) cell.failedChecks.push(metric.metric);
    }
    cells.set(key, cell);
  }
  const sorted = [...cells.values()].sort(
    (a, b) => a.useCase.localeCompare(b.useCase) || a.runner.localeCompare(b.runner)
  );
  for (const cell of sorted) {
    const scored = cell.pass + cell.fail;
    cell.passRate = scored > 0 ? cell.pass / scored : null;
  }
  return { cells: sorted };
}

export function formatScorecard(scorecard: Scorecard): string[] {
  const lines = ["  Use-case scorecard:"];
  let current = "";
  for (const cell of scorecard.cells) {
    if (cell.useCase !== current) {
      current = cell.useCase;
      lines.push(`    ${current}`);
    }
    const rate = cell.passRate === null ? "n/a" : `${Math.round(cell.passRate * 100)}%`;
    const parts = [`      ${cell.runner}  ${rate} (${cell.pass}/${cell.pass + cell.fail})`];
    if (cell.judgeErrors > 0) parts.push(`judge errors: ${cell.judgeErrors}`);
    if (cell.failedChecks.length > 0) parts.push(`failing: ${cell.failedChecks.join(", ")}`);
    lines.push(parts.join("  "));
  }
  lines.push("");
  return lines;
}
```

- [ ] **Step 4: Attach the scorecard to reports**

In `evals/rag/types.ts`, add at the top of the Reports section:

```ts
import type { Scorecard } from "./reports/scorecard";
```

(Put it with the other imports at the top of the file if the file has any; otherwise as the first line.) In `interface EvalReport`, after `failureGroups: FailureGroup[];` add:

```ts
  /** Per use-case pack × runner pass rates (only when pack fixtures ran) */
  scorecard?: Scorecard;
```

In `evals/rag/reports/reportGenerator.ts`:

Add `import { buildScorecard, formatScorecard } from "./scorecard";`.

In `GenerateReportOptions` add:

```ts
  /** caseId → use-case pack id, for the scorecard */
  useCaseByCase?: Map<string, string>;
```

In `generateReport`, replace the `return { ... };` object with:

```ts
  const scorecard =
    options.useCaseByCase && options.useCaseByCase.size > 0
      ? buildScorecard(metrics, options.useCaseByCase)
      : undefined;

  return {
    timestamp: new Date().toISOString(),
    commitSha: options.commitSha,
    totalCases: uniqueCases.size,
    split: options.split,
    summary,
    metrics,
    failureGroups,
    ...(scorecard && scorecard.cells.length > 0 ? { scorecard } : {}),
  };
```

In `formatReport`, directly before `if (report.failureGroups.length > 0) {` add:

```ts
  if (report.scorecard) {
    lines.push(...formatScorecard(report.scorecard));
  }
```

In `evals/rag/reports/index.ts` add:

```ts
export { buildScorecard, formatScorecard, isJudgeError, type Scorecard } from "./scorecard";
```

- [ ] **Step 5: Run the tests**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag`
Expected: PASS (all eval tests, including `scorecard.test.ts` with 5 tests).

- [ ] **Step 6: Dry-run the CLI and commit Tasks 11 and 13**

Run: `bun run eval:rag:dry`
Expected: exits 0, same fixture count as before (no pack fixtures yet).

Run: `bun run eval:usecases:dry`
Expected: `Running 0 fixture(s)... (dry-run)` then an empty report, exit 0.

Run: `bun run evals/rag/cli.ts --dry-run --use-case nope`
Expected: fails with `Unknown use case "nope". Registered: (none)`.

```bash
bun x biome format --write evals/rag/cli.ts evals/rag/types.ts evals/rag/reports
git add evals/rag/cli.ts evals/rag/types.ts evals/rag/reports
git commit -m "feat(evals): --use-case runs with a per-pack scorecard"
```

---

### Task 14: Compare by use case

**Files:**
- Modify: `evals/rag/types.ts` (`CompareCaseResult`, `CompareReport`), `evals/rag/reports/compare.ts`
- Test: `evals/rag/reports/compare.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `evals/rag/reports/compare.test.ts` (and add `tallyWins` to its import from `./compare`):

```ts
describe("tallyWins", () => {
  it("groups wins by key with ties counting half", () => {
    const cases = [
      { caseId: "a", runner: "quiz", winner: "b", reason: "", useCase: "medical-students" },
      { caseId: "b", runner: "quiz", winner: "tie", reason: "", useCase: "medical-students" },
      { caseId: "c", runner: "chat", winner: "a", reason: "" },
    ] as const;
    expect(tallyWins([...cases], (c) => c.useCase)).toEqual({
      "medical-students": { winsA: 0, winsB: 1, ties: 1, winRateB: 0.75 },
    });
    expect(tallyWins([...cases], (c) => c.runner)).toEqual({
      quiz: { winsA: 0, winsB: 1, ties: 1, winRateB: 0.75 },
      chat: { winsA: 1, winsB: 0, ties: 0, winRateB: 0 },
    });
  });
});
```

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/reports/compare.test.ts` → FAIL (`tallyWins` not exported).

- [ ] **Step 2: Types**

In `evals/rag/types.ts`:
- In `interface CompareCaseResult` add `useCase?: string;` after `reason: string;`.
- In `interface CompareReport` add, after `byRunner: ...;`:

```ts
  /** Same tally grouped by use-case pack (pack fixtures only) */
  byUseCase: Record<string, { winsA: number; winsB: number; ties: number; winRateB: number }>;
```

- [ ] **Step 3: Implement `tallyWins` and use it**

In `evals/rag/reports/compare.ts`, add above `compareArtifactDirs`:

```ts
type WinTally = { winsA: number; winsB: number; ties: number; winRateB: number };

/** Win counts per key (cases whose key is undefined are skipped); ties count half. */
export function tallyWins(
  cases: CompareCaseResult[],
  keyOf: (c: CompareCaseResult) => string | undefined
): Record<string, WinTally> {
  const tally: Record<string, WinTally> = {};
  for (const c of cases) {
    const key = keyOf(c);
    if (key === undefined) continue;
    const row = (tally[key] ??= { winsA: 0, winsB: 0, ties: 0, winRateB: 0 });
    if (c.winner === "a") row.winsA++;
    else if (c.winner === "b") row.winsB++;
    else row.ties++;
  }
  for (const row of Object.values(tally)) {
    const total = row.winsA + row.winsB + row.ties;
    row.winRateB = total > 0 ? (row.winsB + row.ties / 2) / total : 0;
  }
  return tally;
}
```

In `compareArtifactDirs`:
- Add `useCase: artA.useCase,` to the `caseResult` object literal.
- Delete the `const byRunner: CompareReport["byRunner"] = {};` declaration, the per-case `const r = artA.runner; if (!byRunner[r]) {...} ...` block, and the `for (const stats of Object.values(byRunner)) {...}` loop.
- In the returned object, replace the `byRunner` property with:

```ts
    byRunner: tallyWins(cases, (c) => c.runner),
    byUseCase: tallyWins(cases, (c) => c.useCase),
```

- [ ] **Step 4: Run tests and commit**

Run: `bun x vitest run --config vitest.convex.config.ts evals/rag/reports`
Expected: PASS.

```bash
bun x biome format --write evals/rag/types.ts evals/rag/reports/compare.ts evals/rag/reports/compare.test.ts
git add evals/rag/types.ts evals/rag/reports/compare.ts evals/rag/reports/compare.test.ts
git commit -m "feat(evals): group eval:compare results by use case"
```

---

### Task 15: Docs and env

**Files:**
- Create: `evals/rag/usecases/README.md`
- Modify: `evals/rag/env.eval.example`, `scripts/bootstrap-rag-eval-env.js`, `evals/rag/fixtures/README.md`, `CLAUDE.md`

- [ ] **Step 1: `evals/rag/env.eval.example`**

In the header comment block, after `#   RAG_EVAL_SECRET=<same value as below>` add:

```
#   RAG_EVAL_OWNER_EMAIL=<email of the account that owns the use-case pack notebooks>
#     (npx convex env set RAG_EVAL_OWNER_EMAIL you@example.com)
```

- [ ] **Step 2: `scripts/bootstrap-rag-eval-env.js`**

After `setConvexEnv("RAG_EVAL_SECRET", secret);` add:

```js
  const ownerEmail = process.env.RAG_EVAL_OWNER_EMAIL?.trim();
  if (ownerEmail) {
    setConvexEnv("RAG_EVAL_OWNER_EMAIL", ownerEmail);
  } else {
    console.log(
      "  (skipped RAG_EVAL_OWNER_EMAIL: run `npx convex env set RAG_EVAL_OWNER_EMAIL <your-email>` to use eval:seed)"
    );
  }
```

In the "Next steps" block add:

```js
  console.log("  3. Use-case packs: bun run eval:seed && bun run eval:usecases");
```

- [ ] **Step 3: Create `evals/rag/usecases/README.md`**

````markdown
# Use-case eval packs

One folder per advertised use case. The first four packs cover the landing-page use cases: language learners, medical students, professionals, researchers. Design: [`docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md`](../../../docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md).

## Layout

```
<pack-id>/
  manifest.ts     # export const <name>Pack: UseCasePack
  fixtures.ts     # export const <name>Fixtures: EvalFixture[]
  sources/
    LICENSES.md   # one entry per source: file name, licence, attribution, origin URL
    <files>       # .pdf .docx .pptx .md .txt; openly licensed only
```

Register the pack in [`index.ts`](./index.ts): `registerPack(<name>Pack, <name>Fixtures)`.

## Fixtures

- id: `<pack-id>/<slug>`; set `useCase: "<pack-id>"`; never set `notebookId`/`documentIds`.
- `runner` must be listed in the pack's `features`.
- Splits: 1–2 `smoke`, about 6–8 `train`, 2 `holdout`. Never tune against holdout.
- Write requests the way a real user of that audience would. Don't coach enumeration.

## Rubric checks

Each check is a yes/no question about what a good output looks like **for that audience**, e.g. "Does every figure match the source?". Never mention specific fixture contents or expected items. Rubric text stays in eval code. Copying it into production prompts is forbidden (CLAUDE.md, "Prompt authoring").

## Running

```bash
bun run eval:seed -- --use-case <id>        # sync sources into the Test folder notebook, wait for ingestion
bun run eval:usecases                       # smoke split of every pack, with scorecard
bun run eval:rag -- --use-case <id> --split train --export-artifacts --artifacts-dir evals/rag/generated/<run>
bun run eval:usecases:dry                   # offline validation (CI)
```

Deployment env (dev only): `RAG_EVALS_ENABLED=true`, `RAG_EVAL_SECRET`, `RAG_EVAL_OWNER_EMAIL`.
````

- [ ] **Step 4: Pointer in `evals/rag/fixtures/README.md`**

After the `## Dataset splits` section's code block add:

```markdown
### Use-case packs

Fixtures for advertised use cases (language learners, medical students, professionals, researchers) live in [`../usecases/`](../usecases/README.md), not here. Seed with `bun run eval:seed`, run with `bun run eval:usecases`.
```

- [ ] **Step 5: `CLAUDE.md`**

In the `**RAG eval (\`bun run eval:rag\`):**` paragraph, append:

```markdown
Use-case packs (`evals/rag/usecases/`): `bun run eval:seed` then `bun run eval:usecases` (needs `RAG_EVAL_OWNER_EMAIL` on the dev deployment).
```

- [ ] **Step 6: Commit**

```bash
bun x biome format --write scripts/bootstrap-rag-eval-env.js
git add evals/rag/usecases/README.md evals/rag/env.eval.example scripts/bootstrap-rag-eval-env.js evals/rag/fixtures/README.md CLAUDE.md
git commit -m "docs(evals): document use-case packs and RAG_EVAL_OWNER_EMAIL"
```

---

### Task 16: Verification and PR

- [ ] **Step 1: Invoke `superpowers:verification-before-completion`**

- [ ] **Step 2: Run the gates (separately, in this order)**

```bash
bun run typecheck:convex
bun run typecheck:web
bun run lint
bun run test:convex
bun run eval:rag:dry
bun run eval:usecases:dry
```

Expected: all exit 0. `test:convex` includes every new `evals/rag/**` and `convex/eval/**` test.

- [ ] **Step 3: Deployment env (needs the user)**

`RAG_EVAL_OWNER_EMAIL` must be set on the **dev** deployment before `eval:seed` works. That's a deployment config change, so ask the user to run it (or get explicit approval first):

```bash
npx convex env set RAG_EVAL_OWNER_EMAIL <their account email>
```

The new Convex functions reach dev only through the normal deploy path. Don't run `convex dev` or `convex deploy` from this worktree; the dev deployment is shared with other sessions.

- [ ] **Step 4: Open the PR**

Create a GitHub issue first (one PR per issue), e.g. "Eval pipeline: use-case eval packs framework", labels `type:feature`, `area:ci`. Then use `superpowers:finishing-a-development-branch`. PR title: `feat(evals): use-case eval packs framework`. Body: link the spec, list follow-ups (four pack PRs; generic answer-leak/answer-key checks #218/#219), note the #209 dependency for live rubric scoring, and include `Closes #<issue>`.

---

## Self-review notes

- **Spec coverage:** §1 layout/validation → Tasks 1–3. §2 seeding → Tasks 4–9 (sync plan, prod guard, internal functions, gated actions incl. `getPackSourceText`, orchestration, CLI). §3 CLI → Tasks 10–11. §4 rubric/scorecard/judge errors/judge queue → Tasks 12–13; compare by use case → Task 14. §5 error handling → Tasks 7 (owner env), 8 (ingestion failure, timeout), 9 (prod guard), 10–11 (abort before run). §6 testing → tests in Tasks 2–8, 10, 12–14. Promotion stays non-blocking for rubric metrics with no code change, because `promotion.ts` only matches `binary_judge_*` prefixes.
- **Known gap by design:** `USE_CASE_PACKS` is empty, so the live `eval:seed` → `eval:usecases` path is first exercised by the language-learners pack PR.
