# Use-case eval packs — design

**Date:** 2026-09-29
**Status:** Draft, awaiting review
**Scope:** Framework only (piece 1 of 4). Pack contents, generic answer checks, and agent tuning are follow-ups.

## Problem

The landing page (`apps/web/src/features/landing/components/UseCasesSection.tsx`) advertises SolomindLM for medical students, researchers, language learners, professionals, lifelong learners, and study groups. The RAG eval suite tests none of these directly. Every fixture points at one of two hand-made dev notebooks (`jd702jq641ensjca91c9hwp4d985pgax`: agentic design patterns, `jd72h9qsq5zap11ede5k8rqkx585djmc`: machine learning). All eval signal comes from one content type: English technical ML text.

Result: use-case failures are found by hand. #218 (answers on flashcard fronts) and #219 (answer keys the source doesn't support) came from manually reviewing a French course notebook. The evals never saw that kind of content.

## Goal

Score every agent against content and requests typical of each advertised use case, and report a per-use-case scorecard. That tells us where to improve agents, and whether a change helped one use case at another's expense.

**First four packs:** language learners, medical students, professionals, researchers. Each pack has about 8–12 fixtures.

**Non-goal:** tuning prompts to the packs. Fixes driven by the scorecard must be general pipeline engineering, per the CLAUDE.md prompt rule. Rubric text lives in eval code only.

## Decomposition

1. **Framework (this spec):** pack layout, seeding, CLI and runner integration, rubric judges, scorecard.
2. **Generic deterministic checks:** answer-leak detection and answer-key grounding for all flashcard and quiz outputs (#218, #219). Separate spec and PR.
3. **Pack contents:** one PR per use case (sources, fixtures, final rubric).
4. **Agent tuning:** driven by the scorecard, one issue and PR per fix.

## 1. Pack layout and manifest

```
evals/rag/usecases/
  index.ts                  # USE_CASE_PACKS registry; pack fixtures merged into FIXTURES
  types.ts                  # UseCasePack, RubricCheck
  usecases.test.ts          # pack validation
  <pack-id>/
    manifest.ts
    fixtures.ts
    sources/
      LICENSES.md           # attribution + licence per file
      <source files>        # openly licensed: OpenStax, PMC OA, arXiv CC-BY, public reports, …
```

`UseCasePack`:

| Field | Meaning |
|---|---|
| `id` | e.g. `"language-learners"`; matches the folder name |
| `title` | Display name |
| `notebookTitle` | Notebook title in the eval account's `Test` folder, e.g. `"Language Learners"` |
| `advertisedClaim` | The landing-page copy this pack verifies |
| `features` | Runners the pack exercises (`flashcards`, `quiz`, `writtenQuestions`, `chat`, `report`, …) |
| `sources` | File names in `sources/` |
| `rubric` | `RubricCheck[]` (section 4) |

**Fixtures:** `EvalFixture` gains optional `useCase?: string`. Pack fixtures set `useCase` and leave `notebookId`/`documentIds` unset; section 3 fills them at run time. Fixture ids are namespaced: `<pack-id>/<slug>`. Splits per pack: 1–2 `smoke`, about 6–8 `train`, 2 `holdout`. Holdout fixtures are never used while tuning.

**Validation (`validatePack`):** every listed source is a plain file name that exists (exact case) and has an entry in `LICENSES.md`; fixture ids are unique and prefixed with the pack id; every fixture sets `split`; every fixture runner is in `features`; every rubric check applies to at least one listed feature. It runs in `registry.test.ts` (part of `test:convex` in CI), in `eval:seed`, and in dry runs that select pack fixtures (`eval:usecases:dry`). Plain `eval:rag:dry` skips pack fixtures, so adding `eval:usecases:dry` to CI belongs in the first pack PR.

## 2. Seeding

**Command:** `bun run eval:seed [--use-case <id>]`. It uses the existing `RAG_EVAL_CONVEX_URL` and `RAG_EVAL_SECRET`.

**Owner and location:** pack notebooks live in the account named by a new env var, `RAG_EVAL_OWNER_EMAIL`. It's set on the dev deployment, is the maintainer's own account, and gets added to `evals/rag/env.eval.example` and `scripts/bootstrap-rag-eval-env.js`. Notebooks sit in that account's `Test` folder, matched by `notebookTitle`. The folder and the four notebooks already exist on dev (created 2026-09-29). If either is missing, the seeder creates it, so a fresh deployment can be rebuilt.

**Source sync:** each committed file maps to one document, matched by `fileName`. The seeder stores the file's sha256 in the document's existing `metadata` field (`v.any()`; ingestion doesn't write to it). No schema change. The pure function `planPackSync(manifestFiles, remoteDocs)` returns one action per file:

| Remote state | Action |
|---|---|
| No document with that file name | `upload` |
| Hash differs | `replace` (remove, then upload) |
| Status `failed` | `replace` |
| Hash matches, status `completed` | `skip` |

Documents in the notebook that don't match a manifest file are left untouched.

**Gated Convex actions** (`convex/eval/seedEvalAction.ts`; each calls `assertRagEvalGate`):

- `resolvePackNotebook({ evalSecret, notebookTitle })` → `{ notebookId, docs: [{ documentId, fileName, status, sha256 }] } | null`
- `createPackNotebook({ evalSecret, notebookTitle })`: creates the `Test` folder if needed, then the notebook inside it
- `getEvalUploadUrl({ evalSecret })` → `ctx.storage.generateUploadUrl()`
- `addPackDocument({ evalSecret, notebookId, storageId, fileName, contentType, sha256 })`: inserts a `file` document through an internal mutation (no plan source limit) and schedules `internal.documents.embeddingJob.docEmbedding`, the same ingestion path as user uploads
- `removePackDocument({ evalSecret, documentId })`: deletes chunks, stored file, and document through a new internal mutation. It reuses `deleteAllChunksForDocument` and mirrors the cleanup in the public `documents.remove` (which requires user auth). It refuses documents outside a notebook owned by the eval owner.

- `getPackSourceText({ evalSecret, documentIds })` → `[{ fileName, text }]`: extracted text for rubric judges (section 4), limited to the eval owner's documents

The owner is resolved on the server from `RAG_EVAL_OWNER_EMAIL`. Callers never pass a user id.

**Flow per pack:** resolve the notebook (create it if missing) → plan → upload file bytes straight to the storage URL → add, replace, or skip each document → poll every 5 s until every planned document is `completed`, with a 10-minute timeout per pack → print notebook id, doc count, and chunk count.

**Safety:** the seeder refuses to run when `RAG_EVAL_CONVEX_URL` equals the prod URL from the repo-root `.env`. `RAG_EVALS_ENABLED` is never set on prod. Eval runs never seed implicitly.

## 3. CLI and runner integration

**Resolution before any job runs:** after fixture filtering, the CLI collects the selected `useCase` values and calls `resolvePackNotebook` once per pack. A pack is ready when every manifest source is present, `completed`, and matches its hash. If any pack isn't ready, the run **aborts before starting any job** and lists the packs to seed (`bun run eval:seed --use-case <id>`).

**Filling in fixtures:** each pack fixture gets `notebookId` plus `documentIds` restricted to the pack's source documents. Documents added to the notebook by hand never reach eval runs, except for `literatureReview` fixtures: that runner accepts only `notebookId`, so it uses the whole pack notebook. Don't hand-add documents to a pack notebook that has `literatureReview` fixtures. The other invokers already accept both fields, so their code doesn't change.

**Flags and scripts:**

- `--use-case <id[,id…]|all>` filters to pack fixtures. It combines with `--runner` and `--split`.
- `--case` and `--prefix` work with the namespaced ids.
- `package.json`: `eval:seed`, `eval:usecases` (smoke split, all packs), `eval:usecases:dry`.
- Before a live run, the CLI prints the planned job count per pack and runner.

**Artifacts:** `EvalRunArtifact` gains `useCase?: string`.

Legacy ML and agentic fixtures keep their hardcoded notebook ids for now.

## 4. Rubric judges and scorecard

**`RubricCheck`:**

```ts
interface RubricCheck {
  id: string;                          // kebab-case, unique within the pack
  question: string;                    // yes/no question about the output
  appliesTo: StudioRunnerKind[] | ("chat" | "research" | "literatureReview")[];
  evidence: "output" | "sources";      // whether the judge also sees source excerpts
}
```

**Scoring:** `scoreRubricMetrics(fixture, artifact, pack)` in `evals/rag/metrics/rubric.ts` runs each check that applies to `artifact.runner`. It uses the existing binary-judge invoker (`createTogetherJudgeInvoker`) and one generic prompt template: check question, formatted output, and source excerpts when `evidence: "sources"`. It emits one `MetricResult` per check, named `rubric:<pack-id>:<check-id>`, scored pass/fail with the judge's reason.

**Source evidence for studio runners:** studio artifacts carry no retrieved chunks (`selectedChunks: []`). When a check needs sources and the artifact has no chunks, the judge gets the pack's extracted source text instead. A gated action `getPackSourceText({ evalSecret, documentIds })` returns each document's `extractedMarkdown`, capped at 50k chars per document. The CLI fetches it once per pack after resolution, and the prompt splits its source budget (12k chars) evenly across documents. On long sources the judge only sees the start of each document. That limitation is accepted here; exhaustive answer-key grounding is piece 2.

**Rubric wording rule:** a check describes the quality a user in that audience expects from any output, for example "Does every figure match the source?". It never refers to specific fixture contents or expected items.

**Scorecard:** a new report section with one row per pack and one column per feature. Each cell shows the pass rate across the generic metrics for that runner plus the pack's rubric checks, and lists the checks that failed. The same data goes into the JSON report. `eval:compare` groups deltas by `useCase`.

**Judge errors:** when a judge fails to produce a verdict (parse failure, truncation, HTTP error), the metric is tagged `judgeError: true` in `breakdown`. The scorecard counts these as `judge-error`, separate from failed checks.

**Promotion:** rubric metrics don't block promotion at first. Rubric verdicts go into the existing judge queue for human labelling. A check becomes blocking once the judge-queue scorer reports enough agreement with those labels.

**Dependency:** PR #209 (reasoning judges failing on long outputs, #207) must merge first.

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Pack not seeded or not ready | Run aborts before any job; lists the packs to seed |
| Document fails ingestion during seeding | Reported with its ingestion error; seeder exits non-zero |
| `RAG_EVAL_OWNER_EMAIL` missing, or no user with that email | Hard stop in seeder and resolver |
| `RAG_EVAL_CONVEX_URL` is prod | Seeder refuses to run |
| Judge returns no verdict | Metric fails with `judgeError: true`; counted separately on the scorecard |

## 6. Testing

TDD with vitest (`*.test.ts` next to source):

- `evals/rag/usecases/usecases.test.ts`: pack validation (section 1).
- `planPackSync`: upload, replace, skip, and failed-document cases; unrelated documents left alone.
- Fixture resolution: fills `notebookId`/`documentIds`, restricts to pack documents, aborts when a pack isn't ready.
- `scoreRubricMetrics`: applicability filtering, prompt includes sources only for `evidence: "sources"`, metric naming, `judgeError` tagging (stub invoker).
- Scorecard aggregation: pass rates per pack × feature, judge errors kept separate.
- `convex-test` for `seedEvalAction`: gate enforced, notebook created inside the `Test` folder, add and remove document, owner resolved from env.

## Out of scope

- Pack contents: sources, fixtures, and final rubrics (four follow-up PRs).
- Generic answer-leak and answer-key grounding checks (#218, #219; separate spec).
- Moving the legacy ML and agentic fixtures onto packs.
- Lifelong-learner and study-group packs.
- Agent or prompt changes.
