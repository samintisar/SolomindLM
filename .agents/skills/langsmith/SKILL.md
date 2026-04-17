---
name: langsmith
description: Use when setting up, debugging, or extending LangSmith tracing and observability for agents in this project. Covers environment configuration, trace config helpers, per-job tracing, and evaluation patterns.
---

# LangSmith Tracing & Observability

LangSmith is used for tracing all agent runs in this project. The integration lives in `convex/_agents/_shared/langsmith.ts` and is used by every Convex action that invokes a LangGraph graph or LangChain LLM.

---

## Environment Variables

LangSmith reads from these env vars (set in Convex):

| Variable                         | Purpose                            | Note                                   |
| -------------------------------- | ---------------------------------- | -------------------------------------- |
| `LANGSMITH_TRACING`              | Enable tracing                     | Preferred: `'true'`                    |
| `LANGCHAIN_TRACING_V2`           | Enable tracing (also works)        | Older name, still supported            |
| `LANGSMITH_API_KEY`              | LangSmith API key                  | Preferred                              |
| `LANGCHAIN_API_KEY`              | LangSmith API key (also works)     | Older name, still supported            |
| `LANGSMITH_PROJECT`              | Project name override              | Preferred                              |
| `LANGCHAIN_PROJECT`              | Project name override (also works) | Older name, still supported            |
| `LANGSMITH_ENDPOINT`             | Custom endpoint                    | Optional                               |
| `LANGCHAIN_CALLBACKS_BACKGROUND` | Async trace flushing               | **Set `false` for Convex** (see below) |

> **`LANGCHAIN_CALLBACKS_BACKGROUND` for Convex:** Convex actions are serverless — the process may exit before async background traces flush. Set this to `'false'` to ensure traces complete before the function returns. Omitting it can cause traces to be silently dropped.

```bash
# Required for reliable tracing on Convex
LANGCHAIN_CALLBACKS_BACKGROUND=false
```

**Auto-detection:** If no project name is set, the code auto-detects dev vs prod from `CONVEX_CLOUD_URL`:

- Contains `'prod'` or `'production'` → `prod-solomind-agents`
- Otherwise → `dev-solomind-agents`

**Push env vars:**

```bash
bun run convex:env:push        # push to dev
bun run convex:env:push:prod   # push to prod
```

---

## Core Helpers (`_shared/langsmith.ts`)

### `createJobLangSmithConfig` — Use This in Jobs

The main helper for Convex action tracing. Creates consistent naming/tags for a specific job:

```typescript
import { createJobLangSmithConfig } from "../_shared/langsmith.js";

// In a Convex internalAction
const langSmithConfig = createJobLangSmithConfig("flashcard", flashcardId, {
  notebookId,
  userId,
  additionalTags: ["source:user-request"],
  additionalMetadata: { documentCount: documentIds.length },
});

// Pass as second arg to graph.invoke()
const result = await graph.invoke(initialState, langSmithConfig);

// Or to LLM calls
const response = await llm.invoke(messages, langSmithConfig);
```

**Generated trace attributes:**

- `runName`: `"flashcard_job_abc12345"` (jobType + first 8 chars of jobId)
- `tags`: `["job:flashcard", "jobId:<id>", "notebook:<id>", ...custom]`
- `metadata`: `{ jobType, jobId, timestamp, notebookId, userId, ... }`

### `createAgentTraceConfig` — Get Config Object

Returns config as a plain object (useful for custom wrappers):

```typescript
import { createAgentTraceConfig } from "../_shared/langsmith.js";

const traceConfig = createAgentTraceConfig("report", reportId, {
  notebookId,
  runNameOverride: "my-custom-run-name",
});
// traceConfig.projectName, .tags, .metadata, .runName
```

### `createLangSmithRunConfig` — Low-Level Callback Config

Creates a callbacks object for direct use with LangChain:

```typescript
import { createLangSmithRunConfig } from "../_shared/langsmith.js";

const config = createLangSmithRunConfig({
  runName: "my-run",
  tags: ["custom-tag"],
  metadata: { key: "value" },
});
// Returns { callbacks: [tracer], tags, metadata, runName }
// or {} if tracing is disabled
```

### `isLangSmithEnabled` — Guard for Conditional Logic

```typescript
import { isLangSmithEnabled } from "../_shared/langsmith.js";

if (isLangSmithEnabled()) {
  // Only log detailed trace info when tracing is on
  console.log("Tracing enabled, project:", getCurrentProjectName());
}
```

### `getCurrentProjectName` — Get Active Project

```typescript
import { getCurrentProjectName } from "../_shared/langsmith.js";
const project = getCurrentProjectName(); // 'dev-solomind-agents' or 'prod-solomind-agents'
```

---

## Typical Usage Pattern in a Convex internalAction

```typescript
"use node";
import { internalAction } from "../../_generated/server.js";
import { createJobLangSmithConfig } from "../_shared/langsmith.js";
import { MyFeatureGraph } from "../MyFeatureGraph.js";

export const myFeatureGeneration = internalAction({
  args: { myFeatureId: v.id("myFeature"), notebookId: v.id("notebooks"), userId: v.string() },
  handler: async (ctx, { myFeatureId, notebookId, userId }) => {
    const langSmithConfig = createJobLangSmithConfig("myFeature", myFeatureId, {
      notebookId,
      userId,
    });

    const graph = new MyFeatureGraph();
    const result = await graph.runGraph(
      { chunks, topic, count },
      langSmithConfig // pass through to graph.invoke()
    );
  },
});
```

---

## Evaluation Patterns (LangSmith SDK)

Use these patterns when building evaluations for agents:

### Create a Dataset

```typescript
import { Client } from "langsmith";

const client = new Client({ apiKey: process.env.LANGSMITH_API_KEY });

const dataset = await client.createDataset("flashcard-quality-v1");
await client.createExamples({
  inputs: [{ text: "The mitochondria is the powerhouse of the cell." }],
  outputs: [{ expectedCount: 2, expectedDifficulty: "easy" }],
  datasetId: dataset.id,
});
```

### Run an Evaluation

```typescript
import { evaluate } from "langsmith/evaluation";

await evaluate(
  async (inputs) => {
    const graph = new FlashcardGraph();
    return graph.runGraph({ chunks: [inputs.text], topic: "", count: 5 });
  },
  {
    data: "flashcard-quality-v1",
    evaluators: [correctCountEvaluator, qualityEvaluator],
    experimentPrefix: "qwen3-80b-baseline",
    maxConcurrency: 4,
  }
);
```

### Custom Evaluator

> **JS/TS vs Python signature difference:** Python evaluators use positional args (`inputs, outputs, referenceOutputs`). JS/TS evaluators use a **single destructured object**. Using positional args in TS will silently receive `undefined` for the 2nd and 3rd params.

```typescript
// ✅ Correct JS/TS signature — single destructured object
function correctCountEvaluator({
  inputs,
  outputs,
  referenceOutputs,
}: {
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  referenceOutputs?: Record<string, any>;
}): { key: string; score: number } {
  const actual = outputs.output?.length ?? 0;
  const expected = referenceOutputs?.expectedCount;
  return {
    key: "count_accuracy",
    score: Math.abs(actual - expected) <= 1 ? 1 : 0,
  };
}

// ❌ Wrong — this is the Python style; in JS/TS, outputs and referenceOutputs will be undefined
// function correctCountEvaluator(inputs, outputs, referenceOutputs) { ... }
```

````

---

## Debugging Traces

**View traces:** Log into LangSmith and check the `dev-solomind-agents` or `prod-solomind-agents` project.

**Common issues:**

| Issue | Fix |
|---|---|
| No traces appearing | Check `LANGCHAIN_TRACING_V2=true` is set in Convex env |
| Traces in wrong project | Check `LANGCHAIN_PROJECT` env var; auto-detection uses `CONVEX_CLOUD_URL` |
| Tracer not reinitializing | Call `resetTracer()` from `_shared/langsmith.ts` — resets singleton |
| API key not found | Set `LANGCHAIN_API_KEY` (preferred) or `LANGSMITH_API_KEY` (fallback) |

**Force reset tracer singleton** (e.g. after config change in tests):
```typescript
import { resetTracer } from '../_shared/langsmith.js';
resetTracer();
````

---

## References

- `convex/_agents/_shared/langsmith.ts` — all LangSmith helpers
- `convex/_lib/env.ts` — env variable access
- LangSmith docs: https://docs.smith.langchain.com
- `langgraph-langchain` skill — building agents that use these traces
