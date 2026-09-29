# Use-case eval packs

One folder per advertised use case. The first four packs cover the landing-page use cases: language learners, medical students, professionals, researchers. Design: [`docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md`](../../../docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md).

## Layout

```
<pack-id>/
  manifest.ts     # export const <name>Pack: UseCasePack
  fixtures.ts     # export const <name>Fixtures: EvalFixture[]
  sources/
    LICENSES.md   # one list entry per source (format below)
    <files>       # .pdf .docx .pptx .md .txt; openly licensed only
```

Register the pack in [`index.ts`](./index.ts): `registerPack(<name>Pack, <name>Fixtures)`.

### `LICENSES.md` format

`validatePack` parses this file. Use exactly one list entry per source:

```
- <fileName>: <licence, attribution, origin URL>
```

Source names in the manifest and in `LICENSES.md` must be plain file names (no paths, no `..`).

## Fixtures

- id: `<pack-id>/<slug>`; set `useCase: "<pack-id>"`; never set `notebookId`/`documentIds`.
- `split` must be set explicitly (`smoke`, `train` or `holdout`); `validatePack` rejects fixtures without it.
- `runner` must be listed in the pack's `features`.
- Splits: 1–2 `smoke`, about 6–8 `train`, 2 `holdout`. Never tune against holdout.
- Write requests the way a real user of that audience would. Don't coach enumeration.

## Rubric checks

Each check is a yes/no question about what a good output looks like **for that audience**, e.g. "Does every figure match the source?". Never mention specific fixture contents or expected items. Rubric text stays in eval code. Copying it into production prompts is forbidden (CLAUDE.md, "Prompt authoring").

Rubric metrics (`rubric:<pack-id>:<check-id>`) feed the judge calibration queue (`judge-queue.json`) but do not block promotion yet. Live runs still exit 1 on rubric failures, like other judge metrics.

## Notebooks and the eval owner

Pack notebooks live in the eval owner's `Test` folder. The eval owner is the account whose email is `RAG_EVAL_OWNER_EMAIL` (set on the dev deployment). `eval:seed` creates the `Test` folder and the pack notebook if they are missing, uploads changed sources and waits for ingestion.

## Running

```bash
bun run eval:seed                           # seed every registered pack
bun run eval:seed -- --use-case <ids|all>   # comma-separated ids, or "all"; also --use-case=<ids>
bun run eval:usecases                       # smoke split of every pack, with per-pack scorecard
bun run eval:rag -- --use-case <id> --split train --export-artifacts --artifacts-dir evals/rag/generated/<run>
bun run eval:usecases:dry                   # offline dry run of pack fixtures (no Convex)
```

- `eval:seed` rejects unknown options and stray arguments instead of ignoring them.
- A `--use-case` run exits 2 if `--split`, `--runner` or `--prefix` leave no pack fixtures (dry runs too). `--case` overrides `--use-case`.
- `eval:compare` groups its results by use case (`byUseCase`) in addition to by runner.

Deployment env (dev only): `RAG_EVALS_ENABLED=true`, `RAG_EVAL_SECRET`, `RAG_EVAL_OWNER_EMAIL`. Set the owner with `npx convex env set RAG_EVAL_OWNER_EMAIL you@example.com`. The bootstrap script only pushes it if `RAG_EVAL_OWNER_EMAIL` is exported in your shell; otherwise run `npx convex env set RAG_EVAL_OWNER_EMAIL <email>` against the dev deployment.

Pack consistency (sources, licences, fixtures, rubric) is validated by `bun run test:convex` (`evals/rag/usecases/registry.test.ts`) and by `eval:seed`.
