# RAG Evaluation Fixtures Guide

## Quick Start: Generate Q&A with NotebookLM

The fastest way to create fixtures is using NotebookLM:

1. **Open NotebookLM** (notebooklm.google.com) and add your notebook's sources
2. **Copy the prompt** from `notebookLM_prompt.txt` in this directory
3. **Paste into NotebookLM** and generate Q&A pairs
4. **Convert to fixtures** using the helper below

```typescript
import { convertNotebookLM } from "./notebookLM_converter";

// Paste NotebookLM output here
const nlmOutput = `
### Question: What is...
### Expected Answer: ...
...
`;

// Convert directly to fixtures (using your ML notebook ID)
const fixtures = convertNotebookLM(
  nlmOutput,
  "jd72h9qsq5zap11ede5k8rqkx585djmc", // Your ML notebook ID
  "ml-" // ID prefix for generated fixtures
);

// Register in fixtures/index.ts
export const FIXTURES = {
  ...Object.fromEntries(fixtures.map((f) => [f.id, f])),
};
```

---

## Manual Fixture Creation

## Quick Start: Adding Your Q&A Pairs

To add your own test fixtures, use the `createFixture` helper:

```typescript
// In evals/rag/fixtures/myFixtures.ts
import { createFixture, createFixtureBatch } from "./fixtureTemplate";

// Single fixture
export const myMlFixture = createFixture({
  id: "ml-backprop-001",
  question: "Explain how backpropagation works.",
  expectedAnswer: `Backpropagation computes gradients by applying the chain rule
  recursively from the output layer back to the input layer...`,
  expectedBehavior: "Should mention chain rule, gradient computation, and weight updates.",
  notebookId: "your-notebook-id-from-convex",
  tags: ["ml", "technical", "explanation"],
  runner: "chat",
});

// Batch fixtures
export const mlBasicsFixtures = createFixtureBatch({
  idPrefix: "ml-basic-",
  notebookId: "your-notebook-id",
  scenarioCategory: "technical",
  defaultTags: ["ml", "foundational"],
  qaPairs: [
    {
      question: "What is overfitting?",
      expectedAnswer: "Overfitting occurs when a model learns training data patterns too well...",
    },
    {
      question: "What is the difference between classification and regression?",
      expectedAnswer:
        "Classification predicts discrete labels while regression predicts continuous values...",
    },
  ],
});
```

## Dataset splits

Fixtures use `smoke` (fast daily gate), `train` (iteration), or `holdout` (rare confirm). Set `split` on the fixture or rely on [`splits.ts`](../../splits.ts) defaults.

```bash
bun run eval:rag -- --split smoke          # live default
bun run eval:rag:dry                     # validate all fixtures (CI)
bun run eval:holdout                     # holdout only
bun run eval:rag -- --case agentic-patterns-20 --export-artifacts --artifacts-dir evals/rag/generated/run-a
bun run eval:compare -- evals/rag/generated/run-a evals/rag/generated/run-b
```

### Judge settings

- `--judge-reasoning on|off`: off by default on the `smoke` split (cheaper and more deterministic); the model default on `train`, `holdout` and single-case runs. An explicit flag always wins.
- `--judge-consistency <fraction>`: re-runs that share of binary judge calls, chosen deterministically per case and metric (default `0.1` on live runs, `0` on dry runs). A repeat that disagrees keeps the first verdict and marks the row `judgeUnstable` with `secondVerdict`. The run prints `Judge self-consistency: agreed/sampled (rate)` and the report carries `judgeConsistency`.

### Use-case packs

Fixtures for advertised use cases (language learners, medical students, professionals, researchers) live in [`../usecases/`](../usecases/README.md), not here. Seed with `bun run eval:seed`, run with `bun run eval:usecases`.

### Loop 1 — quality ops

1. Daily: `bun run eval:rag:smoke` (writes `evals/rag/generated/judge-queue.json`).
2. Label 20 rows (`humanAgree: true|false`). Then:
   `bun run eval:rag -- --score-judge-queue evals/rag/generated/judge-queue.json --append-calibration`
   The labels are appended to the committed store in [`../calibration/`](../calibration/README.md); the
   scorer prints agreement and kappa per judge family.
3. After a pipeline change: snapshot train (`bun run eval:rag:train:snapshot`) and
   `bun run eval:compare -- <before-dir> <after-dir>`.
4. Promotion: run holdout, then
   `bun run eval:rag -- --promotion-check <before-report.json> <after-report.json>`.
   Grounding/structure fails block ship. `expected_item_recall` does not.
5. Do not start Loop 3 (prompt compile) until the judge-queue scorer prints
   `readyForPromptCompile: true`.

**Repeats and flaky cases.** The smoke split runs each fixture 3 times by default (`--repeats <n>` overrides; dry runs use 1). Each metric row reports the mean score, `passAll` (pass^k: passed every repeat) and `passAny`. When the verdicts disagree across repeats (or the metric is missing from some repeats) the row is **flaky**. A majority of repeats failing (at least half) merges to `fail`, so it still blocks; a minority of fails merges to a `warn` flaky row. Flaky warnings never block `--promotion-check`; a majority-fail flaky row does. Flaky rows are listed under "Flaky (repeats disagree)" in the report. Artifacts, the Ragas export and the judge queue use the first repeat only.

Do not coach enumeration in `customPrompt` (no “list the 20 names”). Use product-like user requests; keep expected items for metrics only.


1. Open your app and navigate to the notebook
2. Check the URL: `.../notebooks/[NOTEBOOK_ID]/...`
3. Or query Convex directly: `ctx.db.query("notebooks").first().then(n => n._id)`

## Scenario Categories

Use these tags to classify your fixtures (auto-inferred if not specified):

| Category           | Description            | Example Questions                                  |
| ------------------ | ---------------------- | -------------------------------------------------- |
| `factoid`          | Single-fact QA         | "What is the activation function in transformers?" |
| `list-enumeration` | Structured list        | "What are the 20 agentic patterns?"                |
| `comparison`       | Cross-source synthesis | "Compare SGD and Adam optimizers."                 |
| `causality`        | Multi-hop reasoning    | "Why does batch norm stabilize training?"          |
| `temporal`         | Time/sequence queries  | "What were the key milestones in deep learning?"   |
| `ambiguous`        | Disambiguation testing | "What is attention?" (could be many types)         |
| `multi-doc`        | Across sources         | "What do all sources agree on regarding X?"        |
| `technical`        | Domain-specific        | "Derive the backprop equations."                   |
| `summarization`    | Long-form condense     | "Summarize the key ideas from this transcript."    |
| `explanation`      | "How does X work?"     | "How does self-attention work?"                    |

## Registering Fixtures

Add your fixtures to the registry in `index.ts`:

```typescript
// In evals/rag/fixtures/index.ts
import { myMlFixture, mlBasicsFixtures } from "./myFixtures";

export const FIXTURES: Record<string, EvalFixture> = {
  [agenticPatterns20.id]: agenticPatterns20,
  [myMlFixture.id]: myMlFixture,
  ...Object.fromEntries(mlBasicsFixtures.map((f) => [f.id, f])),
};
```

## Metrics Per Scenario

| Scenario           | Deterministic Metrics | LLM Judge Metrics                         |
| ------------------ | --------------------- | ----------------------------------------- |
| `list-enumeration` | expectedItemRecall ✓  | -                                         |
| `factoid`          | expectedItemRecall    | correctness ✓                             |
| `comparison`       | -                     | correctness, faithfulness ✓               |
| `causality`        | -                     | correctness, faithfulness, completeness ✓ |
| `explanation`      | -                     | correctness, faithfulness, completeness ✓ |
| `summarization`    | -                     | completeness, faithfulness ✓              |

## Gold passages (`expectedPassages`)

Most prose fixtures have no `expectedItems`, so item-based retrieval metrics cannot score them. `expectedPassages` gives them retrieval gold: verbatim quotes from the fixture's sources that a correct answer needs.

**Authoring.** Copy each quote verbatim from a markdown or text source, 8 to 30 words, with its punctuation. Matching ignores case, punctuation, dash and quote style, and markdown marks, but it keeps decimal points and thousands commas inside numbers. Use one to three quotes per fixture. Studio fixtures take none.

**Checks.** `validatePack` checks that every quote is 8 to 30 words and, for a pack whose sources are all markdown or text, that it appears in those sources. A pack that also has PDFs skips the text check. Before a live run starts, every pack quote is checked against the extracted text of its pack, and the run exits 2 listing any that are missing. That catches OCR drift in PDFs.

**Matching.** Each chunk is checked on its own. A quote never spans two chunks, because chunks are ordered by score, not by position in the document. All three retrieval stages match on the same text: `contextText` when it is set (the passage as the model saw it, with neighbouring previews), otherwise `content`.

**Metrics** (chat artifacts with `expectedPassages`):

| Metric | Stage | Status |
| --- | --- | --- |
| `passage_recall_pre_rerank` | share of quotes held | info |
| `passage_recall_post_rerank` | share of quotes held | info |
| `passage_recall_selected` | share of quotes held | pass ≥ 0.8, warn ≥ 0.5, else fail |
| `passage_precision_selected` | share of selected chunks holding a quote | pass ≥ 0.4, warn ≥ 0.2 (lenient, because selection pads with neighbours) |
| `passage_ndcg_selected` | binary-relevance nDCG over selected chunks | pass ≥ 0.7, warn ≥ 0.4 |

A selected-stage recall miss is routed to `context_selection` when an earlier stage held more quotes, and to `retrieval` otherwise. Abstention correctness applies the same four rules to passage recall. Passage mode uses 0.6 as "sufficient" and warns on a context-selection miss at 0.5 or above. Item mode keeps 0.7.

**Reference-free context judge** (`llm_context_precision`, `llm_context_waste_tokens`). Chat fixtures with neither `expectedItems` nor `expectedPassages` get one judge call per artifact. The judge sees each selected chunk's first 1200 characters of `content` and names the chunks the answer needs. Both metrics are info-only and never fail a run. A judge error shows as warn with `judgeError: true`. Results are cached in process by judge model, question and chunk text. The context judge does not run on dry runs or retrieval-only runs.

## Running Evaluations

Non-dry runs invoke the gated Convex eval action against a **dev** deployment only.

Template (copy variables into repo-root `.env`; Bun loads it for `bun run eval:rag`): see [`evals/rag/env.eval.example`](../env.eval.example).

**Local `.env`** (CLI):

- `RAG_EVAL_CONVEX_URL` — your dev deployment `https://….convex.cloud`
- `RAG_EVAL_SECRET` — long random string (≥16 chars), same value as Convex

**Convex dev deployment** (Dashboard → Environment Variables **or** `bun run convex:env:push` after merging the same secrets into `.env`):

- `RAG_EVALS_ENABLED=true`
- `RAG_EVAL_SECRET` — same as local

`scripts/push-convex-env.mjs` skips `RAG_EVAL_CONVEX_URL` so only the Convex backend vars are uploaded.

```bash
# Preview what would be pushed (optional)
bun run convex:env:push:dry

# Dry run (validate fixtures only; no Convex calls)
bun run eval:rag:dry

# Run all fixtures (real agent)
bun run eval:rag

# Run one fixture
bun run eval:rag -- --case agentic-patterns-20

# Run only literature review fixtures
bun run eval:literature-review
```

### Retrieval-only runs

`--retrieval-only` runs chat fixtures through plan, search, rerank and context selection, then stops before any answer is generated. No answer metrics and no judges run, so a run costs roughly a tenth of a full one. Use it when you are sweeping a retrieval knob (budgets, thresholds, neighbour or opening passages) and only need to know what was found and selected, and how fast. Scores come from the passage metrics (`passage_recall_*`, `passage_precision_selected`, `passage_ndcg_selected`), the item metrics and the latency and token budgets. Use a full run before you judge an answer change. Other runners are skipped with a note. The report is labelled `RETRIEVAL-ONLY RUN`, and latency is not compared to a full-run baseline. A retrieval-only run also stops when retrieval finds no passages. Greetings and clarifying questions still get a direct reply, because they never search, so their artifacts can carry an answer.

```bash
bun run eval:rag -- --retrieval-only --runner chat --split train
```

## Nightly

[`.github/workflows/eval-nightly.yml`](../../../.github/workflows/eval-nightly.yml) runs the smoke split
(3 repeats by default, `workflow_dispatch` takes `repeats`), the use-case packs, and `eval:trend --check`
every night at 03:17 UTC. It needs three repo secrets: `RAG_EVAL_CONVEX_URL`, `RAG_EVAL_SECRET` and
`TOGETHER_AI_API_KEY`. Without them the job logs a notice and does nothing. Reports and artifacts are
uploaded for 30 days, and the rows it appends to [`history/`](history/README.md) are published to the
`eval-history` branch. PR CI stays dry-run only.

Prerequisite: seed the four use-case packs on the target deployment first (`bun run eval:seed -- --use-case all`).
Otherwise the usecases step exits 2 with `PackNotReadyError`.

The history goes to the unprotected `eval-history` branch, not `main`. `main` is protected
(`enforce_admins`), so a bot push to it is rejected. To read the nightly trend, merged with any local rows:

```bash
bun run eval:trend -- --split smoke --branch eval-history
```

## Suggested Fixtures for Machine Learning Notebook

Based on the ML notebook, consider these scenarios:

1. **Factoid**: "What is the universal approximation theorem?"
2. **List**: "What are the main types of regularization?"
3. **Comparison**: "Compare L1 and L2 regularization."
4. **Causality**: "Why does ReLU help with vanishing gradients?"
5. **Explanation**: "How does dropout prevent overfitting during training?"
6. **Temporal**: "What was the progression of optimizer improvements from SGD to Adam?"

Provide Q&A pairs for these and I'll convert them to fixtures.
