# Loop 2 — Budget and routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure real token/latency per stage and encode a 20b-map / 120b-reduce / skip-map policy so cost and speed can move without regressing holdout grounding.

**Architecture:** Add `AgentStageSpan` and `tokenUsageSource` on eval artifacts. Prefer Together `usage` from `cachedLlm` over character estimates. Per-runner token gates replace the global 4000-token static gate. A pure `decideStudioExecutionMode` function is the skip-map policy. Do not rewrite `ReportGraph` in this plan. Do not change prompts.

**Tech Stack:** TypeScript, Convex `"use node"` eval actions, `cachedLlm.ts` usage fields, vitest.

## Global Constraints

- Do not tune production prompts to pass eval gold.
- Holdout grounding must not regress (use Loop 1 `--promotion-check` after live evals).
- Prefer provider token counts; mark estimates explicitly.
- Keep FAST_LLM = `openai/gpt-oss-20b` and SMART_LLM = `openai/gpt-oss-120b` unless env already overrides.
- Tests: `bun run test:convex -- <path>` then `bun run typecheck:convex`.

## File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `evals/rag/types.ts` | Modify | `AgentStageSpan`, `tokenUsageSource` on artifacts |
| `evals/rag/metrics/stageBudget.ts` | Create | Context-token ratio + stage token share metrics |
| `evals/rag/metrics/stageBudget.test.ts` | Create | TDD |
| `evals/rag/metrics/index.ts` | Modify | Per-runner token gates in `latencyCostBudget` |
| `evals/rag/metrics/latencyCostBudget.test.ts` | Modify | Cover per-runner gates |
| `evals/rag/metrics/scorers.ts` | Modify | Run stage budget metrics |
| `convex/_agents/_shared/studioExecutionMode.ts` | Create | `decideStudioExecutionMode` |
| `convex/_agents/_shared/studioExecutionMode.test.ts` | Create | TDD |
| `convex/eval/chatEvalAction.ts` | Modify | `tokenUsageSource: "estimated"` until provider usage is threaded |
| `convex/_agents/_shared/usageAggregate.ts` | Create | `addTokenUsage` helper |

---

### Task 1: Artifact types for spans and usage source

**Files:**
- Modify: `evals/rag/types.ts`
- Create: `evals/rag/types.stageSpan.test.ts` (type-level via a tiny runtime helper `isAgentStageName`)

**Interfaces:**
- Produces:

```typescript
export type AgentStageName =
  | "retrieve"
  | "rerank"
  | "select"
  | "map"
  | "reduce"
  | "parse"
  | "tts";

export interface AgentStageSpan {
  stage: AgentStageName;
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export type TokenUsageSource = "provider" | "estimated";
```

On `EvalRunArtifact` add optional:

```typescript
  tokenUsageSource?: TokenUsageSource;
  stageSpans?: AgentStageSpan[];
```

- [ ] **Step 1: Write failing test for stage name guard**

Create `evals/rag/metrics/stageBudget.ts` will come in Task 2. For this task create `evals/rag/types.agentStage.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isAgentStageName } from "./types.agentStage";

describe("isAgentStageName", () => {
  it("accepts known stages and rejects others", () => {
    expect(isAgentStageName("map")).toBe(true);
    expect(isAgentStageName("tts")).toBe(true);
    expect(isAgentStageName("prompt")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test:convex -- evals/rag/types.agentStage.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement guard + types**

Create `evals/rag/types.agentStage.ts`:

```typescript
import type { AgentStageName } from "./types";

const STAGES = new Set<AgentStageName>([
  "retrieve",
  "rerank",
  "select",
  "map",
  "reduce",
  "parse",
  "tts",
]);

export function isAgentStageName(value: string): value is AgentStageName {
  return STAGES.has(value as AgentStageName);
}
```

Add the types to `evals/rag/types.ts` as specified above (next to `EvalRunArtifact`).

- [ ] **Step 4: Run tests**

Run: `bun run test:convex -- evals/rag/types.agentStage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/rag/types.ts evals/rag/types.agentStage.ts evals/rag/types.agentStage.test.ts
git commit -m "$(cat <<'EOF'
feat: eval artifact stage spans and token usage source

EOF
)"
```

---

### Task 2: Stage / context budget metrics

**Files:**
- Create: `evals/rag/metrics/stageBudget.ts`
- Create: `evals/rag/metrics/stageBudget.test.ts`
- Modify: `evals/rag/metrics/scorers.ts`

**Interfaces:**
- Consumes: `EvalRunArtifact.selectedChunks`, `stageSpans`, `tokenUsage`
- Produces: `contextTokenBudgetRatio(...)`, `stageTokenShare(...)` returning `MetricResult`

Use `countTokens` from `convex/_agents/_shared/tokenizer.ts` for selected-chunk tokens (same estimate as production packing). Importing from convex into evals is already done via `@convex/*` in other eval files — if that path is awkward, duplicate the 4-chars heuristic in `stageBudget.ts` as `estimateTokens(text) => Math.ceil(text.length / 4)` to avoid `"use node"` tokenizer import. **Prefer the local heuristic** so evals stay Convex-runtime-free.

Chat default context budget for the metric: `5200` when we cannot read env (list-query budget). Use `max(selectedTokens / 8000, 0)` wait — the metric should be `selectedTokens / budget` with budget 8000 as the Loop 1 list budget if that landed, else 5200. Read `LIST_QUERY_CONTEXT_TOKEN_BUDGET` only if importing chatConfig pulls env. **Do not import chatConfig** (it needs `env`). Hardcode metric budget constant:

```typescript
export const EVAL_CONTEXT_TOKEN_BUDGET = 8000;
```

- [ ] **Step 1: Failing tests**

```typescript
import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { contextTokenBudgetRatio, stageTokenShare } from "./stageBudget";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "c",
  runner: "chat",
  question: "q",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "b",
  tags: [],
};

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "c",
    runner: "chat",
    configHash: "h",
    answer: "a",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [{ id: "1", sourceTitle: "D", content: "x".repeat(400) }],
    subQueries: [],
    latencyMs: 10,
    timestamp: "2026-08-20T00:00:00.000Z",
    ...partial,
  };
}

describe("contextTokenBudgetRatio", () => {
  it("is selected tokens divided by 8000", () => {
    const result = contextTokenBudgetRatio(fixture, artifact());
    expect(result.metric).toBe("context_token_budget_ratio");
    expect(result.status).toBe("info");
    expect(result.score).toBeCloseTo(100 / 8000, 5);
  });
});

describe("stageTokenShare", () => {
  it("is info when no spans", () => {
    const result = stageTokenShare(fixture, artifact());
    expect(result.status).toBe("info");
    expect(result.score).toBe(0);
  });

  it("reports map share of stage tokens", () => {
    const result = stageTokenShare(
      fixture,
      artifact({
        stageSpans: [
          { stage: "map", latencyMs: 10, tokenUsage: { prompt: 80, completion: 20, total: 100 } },
          { stage: "reduce", latencyMs: 10, tokenUsage: { prompt: 10, completion: 40, total: 50 } },
        ],
      })
    );
    expect(result.breakdown?.mapShare).toBeCloseTo(100 / 150, 5);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test:convex -- evals/rag/metrics/stageBudget.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement metrics and wire scorers**

```typescript
import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";

export const EVAL_CONTEXT_TOKEN_BUDGET = 8000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricResult["status"],
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

export function contextTokenBudgetRatio(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const selectedTokens = artifact.selectedChunks.reduce(
    (sum, chunk) => sum + estimateTokens(chunk.content),
    0
  );
  const ratio = selectedTokens / EVAL_CONTEXT_TOKEN_BUDGET;
  return baseMetric(
    "context_token_budget_ratio",
    fixture,
    artifact,
    "info",
    ratio,
    `${selectedTokens} selected-chunk tokens / ${EVAL_CONTEXT_TOKEN_BUDGET} budget.`,
    { selectedTokens, budget: EVAL_CONTEXT_TOKEN_BUDGET }
  );
}

export function stageTokenShare(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const spans = artifact.stageSpans ?? [];
  const total = spans.reduce((sum, span) => sum + (span.tokenUsage?.total ?? 0), 0);
  if (total === 0) {
    return baseMetric(
      "stage_token_share",
      fixture,
      artifact,
      "info",
      0,
      "No stage token spans on artifact.",
      { total: 0 }
    );
  }
  const byStage: Record<string, number> = {};
  for (const span of spans) {
    byStage[span.stage] = (byStage[span.stage] ?? 0) + (span.tokenUsage?.total ?? 0);
  }
  const mapShare = (byStage.map ?? 0) / total;
  return baseMetric(
    "stage_token_share",
    fixture,
    artifact,
    "info",
    mapShare,
    `Map share ${(mapShare * 100).toFixed(1)}% of ${total} stage tokens.`,
    { ...byStage, mapShare, total }
  );
}
```

In `scoreAllMetrics` after `latencyCostBudget`:

```typescript
  results.push(contextTokenBudgetRatio(fixture, artifact, baseline));
  results.push(stageTokenShare(fixture, artifact, baseline));
```

Import from `./stageBudget`.

- [ ] **Step 4: Run tests**

Run: `bun run test:convex -- evals/rag/metrics/stageBudget.test.ts evals/rag/metrics/scorers.test.ts`

Expected: PASS (scorers routing tests still pass; extra metrics are fine)

- [ ] **Step 5: Commit**

```bash
git add evals/rag/metrics/stageBudget.ts evals/rag/metrics/stageBudget.test.ts evals/rag/metrics/scorers.ts
git commit -m "$(cat <<'EOF'
feat: context and stage token-share eval metrics

EOF
)"
```

---

### Task 3: Per-runner static token gates

**Files:**
- Modify: `evals/rag/metrics/index.ts` (`latencyCostBudget`)
- Modify: `evals/rag/metrics/latencyCostBudget.test.ts`

**Why:** `STATIC_TOTAL_TOKENS_GATE = 4000` makes healthy studio/research runs look like cost failures. Mirror the existing per-runner latency map.

```typescript
const PER_RUNNER_TOKEN_GATE: Record<string, number> = {
  chat: 8000,
  research: 20000,
  both: 20000,
  report: 25000,
  flashcards: 20000,
  quiz: 20000,
  mindmap: 20000,
  infographic: 15000,
  spreadsheet: 20000,
  writtenQuestions: 20000,
  audioScript: 15000,
  audioScriptOnly: 8000,
  literatureReview: 30000,
};
```

Use `PER_RUNNER_TOKEN_GATE[artifact.runner] ?? 8000` instead of `STATIC_TOTAL_TOKENS_GATE` in the no-baseline branch. Keep baseline-relative 1.2x / 2x logic unchanged.

- [ ] **Step 1: Add failing test**

In `evals/rag/metrics/latencyCostBudget.test.ts` add a case: literatureReview with `tokenUsage.total = 12000`, `latencyMs = 1000` → status `pass` (under 30000), not `fail`.

- [ ] **Step 2: Run to verify fail** (if current gate is 4000, 12000 fails)

Run: `bun run test:convex -- evals/rag/metrics/latencyCostBudget.test.ts`

Expected: FAIL on that new assertion until gates land

- [ ] **Step 3: Implement per-runner token gates** as above. Update the detail string to print the runner gate.

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/rag/metrics/index.ts evals/rag/metrics/latencyCostBudget.test.ts
git commit -m "$(cat <<'EOF'
fix: per-runner token gates so studio cost is not fail-by-design

EOF
)"
```

---

### Task 4: Token usage helpers + mark chat eval estimates

**Files:**
- Create: `convex/_agents/_shared/usageAggregate.ts`
- Create: `convex/_agents/_shared/usageAggregate.test.ts`
- Modify: `convex/eval/chatEvalAction.ts`

**Interfaces:**

```typescript
export type TokenUsage = { prompt: number; completion: number; total: number };

export function addTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage {
  return {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
}

export function fromProviderUsage(usage?: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}): TokenUsage | undefined {
  if (!usage) return undefined;
  return { prompt: usage.promptTokens, completion: usage.completionTokens, total: usage.totalTokens };
}
```

- [ ] **Step 1: Failing tests** for `addTokenUsage` summing two usages and treating undefined as zero.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement `usageAggregate.ts`. In `chatEvalAction` return, set `tokenUsageSource: "estimated"` next to `estimateChatTokenUsage`.**

Chat eval action result type must include `tokenUsageSource?: "provider" | "estimated"`. Thread it through `evals/rag/runners/convexChatInvoker.ts` and `evals/rag/runners/chatRunner.ts` onto `EvalRunArtifact.tokenUsageSource` (default `"estimated"`).

- [ ] **Step 4: Run tests + `bun run typecheck:convex`**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: mark chat eval token usage as estimated until provider usage is wired

EOF
)"
```

---

### Task 5: Skip-map / single-pass policy (pure function first)

**Files:**
- Create: `convex/_agents/_shared/studioExecutionMode.ts`
- Create: `convex/_agents/_shared/studioExecutionMode.test.ts`

**Interfaces:**

```typescript
export type StudioExecutionMode = "map_reduce" | "single_pass";

export function decideStudioExecutionMode(input: {
  documentCount: number;
  selectedChunkCount: number;
  estimatedContextTokens: number;
}): StudioExecutionMode {
  if (input.documentCount <= 1 && input.selectedChunkCount <= 8 && input.estimatedContextTokens <= 4000) {
    return "single_pass";
  }
  return "map_reduce";
}
```

- [ ] **Step 1: Tests** — one-doc tiny notebook → `single_pass`; 12 docs → `map_reduce`.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement the function only. Do not wire ReportGraph yet.**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: studio map-reduce vs single-pass policy function

EOF
)"
```

---

## Verification

```bash
bun run test:convex -- evals/rag/metrics evals/rag/types.agentStage.test.ts convex/_agents/_shared/usageAggregate.test.ts convex/_agents/_shared/studioExecutionMode.test.ts
bun run typecheck:convex
```

Live (optional): one studio smoke artifact should include `tokenUsageSource`. Promotion: Loop 1 `--promotion-check` against the previous holdout report.

Graph skip-map wiring is **out of this plan** (follow-up after the policy function exists).
