# RAG Evaluation Fixtures Guide

## Quick Start: Generate Q&A with NotebookLM

The fastest way to create fixtures is using NotebookLM:

1. **Open NotebookLM** (notebooklm.google.com) and add your notebook's sources
2. **Copy the prompt** from `notebookLM_prompt.txt` in this directory
3. **Paste into NotebookLM** and generate Q&A pairs
4. **Convert to fixtures** using the helper below

```typescript
import { convertNotebookLM } from "./fixtures";

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

## Finding Your Notebook ID

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

## Running Evaluations

Non-dry runs invoke the gated Convex eval action against a **dev** deployment only.

Template (copy variables into repo-root `.env`; Bun loads it for `bun run eval:rag`): see [`evals/rag/env.eval.example`](../env.eval.example).

**Local `.env`** (CLI):

- `RAG_EVAL_CONVEX_URL` — your dev deployment `https://….convex.cloud`
- `RAG_EVAL_SECRET` — long random string (≥16 chars), same value as Convex

**Convex dev deployment** (Dashboard → Environment Variables **or** `bun run convex:env:push` after merging the same secrets into `.env`):

- `RAG_EVALS_ENABLED=true`
- `RAG_EVAL_SECRET` — same as local

`scripts/push-convex-env.js` skips `RAG_EVAL_CONVEX_URL` so only the Convex backend vars are uploaded.

```bash
# Preview what would be pushed (optional)
bun run convex:env:push:dry

# Dry run (validate fixtures only; no Convex calls)
bun run eval:rag:dry

# Run all fixtures (real agent)
bun run eval:rag

# Run one fixture
bun run eval:rag -- --case agentic-patterns-20
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
