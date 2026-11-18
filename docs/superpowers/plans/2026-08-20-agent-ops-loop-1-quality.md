# Loop 1 — Quality ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the quality loop so we can localize pipeline failures, calibrate binary judges, and promote changes with a holdout check — without coaching production prompts.

**Architecture:** Keep `evals/rag` as the measurement plane. Add a deterministic judge-agreement scorer on labeled `judge-queue.json`, a holdout promotion checker against two report JSONs, and a list-query selection cap that is not hardcoded to any fixture’s expected-item list.

**Tech Stack:** TypeScript, vitest (`bun run test:convex`), existing eval CLI (`evals/rag/cli.ts`), Convex chat selection (`chunkContext.ts`).

## Global Constraints

- Do not put expected item names, notebook IDs, or fixture IDs into production prompt text or `customPrompt`.
- Do not enable Likert judges on smoke (`--likert-judges` stays off by default).
- Do not add a vision model; vision judge stays skipped unless `EVAL_VISION_JUDGE` is set.
- Tests live next to source as `*.test.ts`. Run: `bun run test:convex -- <path>`.
- Commits: conventional (`feat:`, `fix:`, `test:`). Do not commit secrets.

## File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `evals/rag/reports/judgeCalibration.ts` | Create | Score labeled judge queue (agreement, coverage) |
| `evals/rag/reports/judgeCalibration.test.ts` | Create | TDD for agreement math |
| `evals/rag/reports/promotion.ts` | Create | Compare two `EvalReport` JSON summaries for holdout regression |
| `evals/rag/reports/promotion.test.ts` | Create | TDD for promotion pass/fail |
| `evals/rag/cli.ts` | Modify | `--score-judge-queue` and `--promotion-check` flags |
| `evals/rag/reports/index.ts` | Modify | Re-export new modules |
| `convex/_agents/chat/chatConfig.ts` | Modify | List-query chunk cap constant (raise from 12 without naming fixtures) |
| `convex/_agents/chat/chunkContext.test.ts` | Modify | Assert list-query cap uses the new constant |
| `evals/rag/fixtures/README.md` | Modify | How to label and run promotion check |

---

### Task 1: Judge calibration agreement

**Files:**
- Create: `evals/rag/reports/judgeCalibration.ts`
- Create: `evals/rag/reports/judgeCalibration.test.ts`
- Modify: `evals/rag/reports/index.ts`
- Test: `evals/rag/reports/judgeCalibration.test.ts`

**Interfaces:**
- Consumes: `JudgeCalibrationItem` from `evals/rag/reports/judgeQueue.ts`
- Produces: `scoreJudgeCalibration(items: JudgeCalibrationItem[]): JudgeCalibrationScore`

- [ ] **Step 1: Write the failing test**

Create `evals/rag/reports/judgeCalibration.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { JudgeCalibrationItem } from "./judgeQueue";
import { scoreJudgeCalibration } from "./judgeCalibration";

function item(
  partial: Partial<JudgeCalibrationItem> & Pick<JudgeCalibrationItem, "humanAgree">
): JudgeCalibrationItem {
  return {
    id: 1,
    caseId: "c",
    runner: "chat",
    metric: "binary_judge_chat_grounding",
    modelStatus: "pass",
    score: 1,
    modelReason: "ok",
    ...partial,
  };
}

describe("scoreJudgeCalibration", () => {
  it("ignores unlabeled rows and reports agreement on labeled rows", () => {
    const result = scoreJudgeCalibration([
      item({ id: 1, humanAgree: true, modelStatus: "pass" }),
      item({ id: 2, humanAgree: false, modelStatus: "fail" }),
      item({ id: 3, humanAgree: null, modelStatus: "pass" }),
    ]);
    expect(result.labeled).toBe(2);
    expect(result.unlabeled).toBe(1);
    expect(result.agreed).toBe(1);
    expect(result.agreement).toBe(0.5);
    expect(result.readyForPromptCompile).toBe(false);
  });

  it("is ready when at least 20 labeled rows and agreement is >= 0.8", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item({
        id: i + 1,
        humanAgree: i < 16,
        modelStatus: "fail",
      })
    );
    const result = scoreJudgeCalibration(items);
    expect(result.labeled).toBe(20);
    expect(result.agreement).toBe(0.8);
    expect(result.readyForPromptCompile).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- evals/rag/reports/judgeCalibration.test.ts`

Expected: FAIL with `Cannot find module './judgeCalibration'`

- [ ] **Step 3: Write minimal implementation**

Create `evals/rag/reports/judgeCalibration.ts`:

```typescript
import type { JudgeCalibrationItem } from "./judgeQueue";

export interface JudgeCalibrationScore {
  labeled: number;
  unlabeled: number;
  agreed: number;
  agreement: number;
  /** Loop 3 must not start until this is true. */
  readyForPromptCompile: boolean;
}

const MIN_LABELED = 20;
const MIN_AGREEMENT = 0.8;

export function scoreJudgeCalibration(items: JudgeCalibrationItem[]): JudgeCalibrationScore {
  const unlabeled = items.filter((row) => row.humanAgree === null).length;
  const labeledRows = items.filter((row) => row.humanAgree !== null);
  const agreed = labeledRows.filter((row) => row.humanAgree === true).length;
  const labeled = labeledRows.length;
  const agreement = labeled === 0 ? 0 : agreed / labeled;
  return {
    labeled,
    unlabeled,
    agreed,
    agreement,
    readyForPromptCompile: labeled >= MIN_LABELED && agreement >= MIN_AGREEMENT,
  };
}
```

Re-export from `evals/rag/reports/index.ts`:

```typescript
export { type JudgeCalibrationScore, scoreJudgeCalibration } from "./judgeCalibration";
```

- [ ] **Step 4: Run tests**

Run: `bun run test:convex -- evals/rag/reports/judgeCalibration.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/rag/reports/judgeCalibration.ts evals/rag/reports/judgeCalibration.test.ts evals/rag/reports/index.ts
git commit -m "$(cat <<'EOF'
feat: score binary-judge calibration agreement

EOF
)"
```

---

### Task 2: CLI to score a labeled queue file

**Files:**
- Modify: `evals/rag/cli.ts`
- Test: add a unit-level parse helper if needed; otherwise cover via Task 1 + a small `loadJudgeQueueFile` test

**Interfaces:**
- Consumes: `scoreJudgeCalibration`, JSON `{ items: JudgeCalibrationItem[] }` written by current CLI
- Produces: process exit 0 if `readyForPromptCompile`, exit 1 if labeled but not ready, exit 2 if unlabeled < 20

- [ ] **Step 1: Write failing tests for the file loader**

Create `evals/rag/reports/judgeQueueFile.test.ts`:

```typescript
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadJudgeQueueFile } from "./judgeQueueFile";

describe("loadJudgeQueueFile", () => {
  it("reads items from the CLI queue shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "jq-"));
    const path = join(dir, "judge-queue.json");
    try {
      writeFileSync(
        path,
        JSON.stringify({
          instruction: "label me",
          items: [
            {
              id: 1,
              caseId: "c",
              runner: "chat",
              metric: "binary_judge_chat_grounding",
              modelStatus: "fail",
              score: 0,
              modelReason: "ungrounded",
              humanAgree: true,
            },
          ],
        })
      );
      const loaded = loadJudgeQueueFile(path);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.humanAgree).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test:convex -- evals/rag/reports/judgeQueueFile.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement loader + CLI flag**

Create `evals/rag/reports/judgeQueueFile.ts`:

```typescript
import { readFileSync } from "fs";
import type { JudgeCalibrationItem } from "./judgeQueue";

export function loadJudgeQueueFile(path: string): JudgeCalibrationItem[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { items?: JudgeCalibrationItem[] };
  if (!Array.isArray(raw.items)) {
    throw new Error(`Judge queue file missing items array: ${path}`);
  }
  return raw.items;
}
```

In `evals/rag/cli.ts` `CliOptions` add:

```typescript
  scoreJudgeQueue?: string;
```

In `parseArgs`, handle `--score-judge-queue <path>`.

At the top of `main()`, before fixture runs:

```typescript
  if (opts.scoreJudgeQueue) {
    const { loadJudgeQueueFile } = await import("./reports/judgeQueueFile");
    const { scoreJudgeCalibration } = await import("./reports/judgeCalibration");
    const items = loadJudgeQueueFile(opts.scoreJudgeQueue);
    const score = scoreJudgeCalibration(items);
    console.log(JSON.stringify(score, null, 2));
    if (score.readyForPromptCompile) process.exit(0);
    if (score.labeled < 20) process.exit(2);
    process.exit(1);
  }
```

Add package.json script:

```json
"eval:rag:judge-queue": "bun --env-file=.env run evals/rag/cli.ts --score-judge-queue evals/rag/generated/judge-queue.json"
```

- [ ] **Step 4: Run tests**

Run: `bun run test:convex -- evals/rag/reports/judgeQueueFile.test.ts evals/rag/reports/judgeCalibration.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/rag/reports/judgeQueueFile.ts evals/rag/reports/judgeQueueFile.test.ts evals/rag/cli.ts package.json
git commit -m "$(cat <<'EOF'
feat: score labeled judge-queue.json from the eval CLI

EOF
)"
```

---

### Task 3: Holdout promotion checker

**Files:**
- Create: `evals/rag/reports/promotion.ts`
- Create: `evals/rag/reports/promotion.test.ts`
- Modify: `evals/rag/cli.ts`

**Interfaces:**
- Consumes: `EvalReport` from `evals/rag/types.ts` (`summary.fail`, `metrics[]`)
- Produces: `checkHoldoutPromotion(before: EvalReport, after: EvalReport): PromotionDecision`

A promotion **fails** if any `(caseId, runner, metric)` that was not `fail` in `before` is `fail` in `after`, restricted to grounding/structure metrics:

```typescript
const PROMOTE_METRICS_PREFIX = [
  "binary_judge_chat_grounding",
  "binary_judge_research_grounding",
  "binary_judge_studio_grounding",
  "binary_judge_studio_structure",
  "binary_judge_lr",
];
```

Do **not** fail promotion on `expected_item_recall` (fixture gold lists are not a ship gate).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import type { EvalReport, MetricResult } from "../types";
import { checkHoldoutPromotion } from "./promotion";

function metric(partial: Partial<MetricResult> & Pick<MetricResult, "metric" | "status">): MetricResult {
  return {
    caseId: "h1",
    runner: "chat",
    configHash: "x",
    score: 0,
    detail: "",
    ...partial,
  };
}

function report(metrics: MetricResult[]): EvalReport {
  return {
    timestamp: "2026-08-20T00:00:00.000Z",
    commitSha: "abc",
    totalCases: 1,
    split: "holdout",
    summary: { pass: 0, fail: 0, warn: 0, info: 0 },
    metrics,
    failureGroups: [],
  };
}

describe("checkHoldoutPromotion", () => {
  it("rejects a new grounding fail", () => {
    const before = report([metric({ metric: "binary_judge_chat_grounding", status: "pass" })]);
    const after = report([metric({ metric: "binary_judge_chat_grounding", status: "fail" })]);
    const decision = checkHoldoutPromotion(before, after);
    expect(decision.ok).toBe(false);
    expect(decision.regressions[0]?.metric).toBe("binary_judge_chat_grounding");
  });

  it("ignores expected_item_recall regressions", () => {
    const before = report([metric({ metric: "expected_item_recall", status: "pass" })]);
    const after = report([metric({ metric: "expected_item_recall", status: "fail" })]);
    expect(checkHoldoutPromotion(before, after).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test:convex -- evals/rag/reports/promotion.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement**

```typescript
import type { EvalReport, MetricResult } from "../types";

const PROMOTE_PREFIXES = [
  "binary_judge_chat_grounding",
  "binary_judge_research_grounding",
  "binary_judge_studio_grounding",
  "binary_judge_studio_structure",
  "binary_judge_lr",
] as const;

export interface PromotionRegression {
  caseId: string;
  runner: string;
  metric: string;
  before: string;
  after: string;
}

export interface PromotionDecision {
  ok: boolean;
  regressions: PromotionRegression[];
}

function isPromoteMetric(name: string): boolean {
  return PROMOTE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function key(row: MetricResult): string {
  return `${row.caseId}::${row.runner}::${row.metric}`;
}

export function checkHoldoutPromotion(before: EvalReport, after: EvalReport): PromotionDecision {
  const beforeByKey = new Map(
    before.metrics.filter((row) => isPromoteMetric(row.metric)).map((row) => [key(row), row])
  );
  const regressions: PromotionRegression[] = [];
  for (const row of after.metrics) {
    if (!isPromoteMetric(row.metric) || row.status !== "fail") continue;
    const prev = beforeByKey.get(key(row));
    if (!prev || prev.status !== "fail") {
      regressions.push({
        caseId: row.caseId,
        runner: row.runner,
        metric: row.metric,
        before: prev?.status ?? "missing",
        after: row.status,
      });
    }
  }
  return { ok: regressions.length === 0, regressions };
}
```

CLI: `--promotion-check <before.json> <after.json>` reading `EvalReport` JSON, print decision, `process.exit(decision.ok ? 0 : 1)`.

- [ ] **Step 4: Run tests**

Run: `bun run test:convex -- evals/rag/reports/promotion.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/rag/reports/promotion.ts evals/rag/reports/promotion.test.ts evals/rag/cli.ts evals/rag/reports/index.ts
git commit -m "$(cat <<'EOF'
feat: holdout promotion check on grounding judges

EOF
)"
```

---

### Task 4: List-query selection cap (pipeline, not prompt)

**Files:**
- Modify: `convex/_agents/chat/chatConfig.ts`
- Modify: `convex/_agents/chat/chunkContext.test.ts`
- Modify: `convex/_agents/chat/ChatAgent.ts` only if it inlines `12` instead of the constant (it already imports `LIST_QUERY_MAX_SELECTED_CHUNKS`)

**Why:** List/enumeration RAG currently caps at 12 chunks (`LIST_QUERY_MAX_SELECTED_CHUNKS`). That starves long enumerations in the *selected* set even when retrieval found the items. Raising the cap is selection policy, not fixture coaching. Do **not** mention `agentic-patterns-20` or `AGENTIC_20_ITEMS` in production code.

- [ ] **Step 1: Write a failing assertion on the constant**

In `convex/_agents/chat/chunkContext.test.ts`, add:

```typescript
import { LIST_QUERY_MAX_SELECTED_CHUNKS } from "./chatConfig.js";

it("keeps a list-query cap large enough for long enumerations", () => {
  expect(LIST_QUERY_MAX_SELECTED_CHUNKS).toBeGreaterThanOrEqual(24);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test:convex -- convex/_agents/chat/chunkContext.test.ts`

Expected: FAIL (`12` is not >= 24)

- [ ] **Step 3: Change the constant**

In `convex/_agents/chat/chatConfig.ts`:

```typescript
/** Max chunks passed to the LLM for list/enumeration questions after global rerank. */
export const LIST_QUERY_MAX_SELECTED_CHUNKS = 24;
```

Leave `LIST_QUERY_CONTEXT_TOKEN_BUDGET` at 5200 unless tests show packing still drops chunks; if the cap of 24 cannot fit in 5200 tokens, raise budget to 8000 in the same commit and add:

```typescript
it("list-query token budget can hold the chunk cap of short passages", () => {
  expect(LIST_QUERY_CONTEXT_TOKEN_BUDGET).toBeGreaterThanOrEqual(8000);
});
```

only if you change the budget.

- [ ] **Step 4: Run tests + convex typecheck**

Run:

```bash
bun run test:convex -- convex/_agents/chat/chunkContext.test.ts
bun run typecheck:convex
```

Expected: PASS / exit 0

- [ ] **Step 5: Commit**

```bash
git add convex/_agents/chat/chatConfig.ts convex/_agents/chat/chunkContext.test.ts
git commit -m "$(cat <<'EOF'
fix: raise list-query selection cap so enumerations fit in context

EOF
)"
```

---

### Task 5: Operator docs

**Files:**
- Modify: `evals/rag/fixtures/README.md`

- [ ] **Step 1: Add the Loop 1 operator section** (no test; docs only)

After the existing “How to use the loop” section, append:

```markdown
### Loop 1 — quality ops

1. Daily: `bun run eval:rag:smoke` (writes `evals/rag/generated/judge-queue.json`).
2. Label 20 rows (`humanAgree: true|false`). Then:
   `bun run eval:rag -- --score-judge-queue evals/rag/generated/judge-queue.json`
3. After a pipeline change: snapshot train (`bun run eval:rag:train:snapshot`) and
   `bun run eval:compare -- <before-dir> <after-dir>`.
4. Promotion: run holdout, then
   `bun run eval:rag -- --promotion-check <before-report.json> <after-report.json>`.
   Grounding/structure fails block ship. `expected_item_recall` does not.
5. Do not start Loop 3 (prompt compile) until the judge-queue scorer prints
   `readyForPromptCompile: true`.
```

- [ ] **Step 2: Commit**

```bash
git add evals/rag/fixtures/README.md
git commit -m "$(cat <<'EOF'
docs: Loop 1 quality ops labeling and promotion

EOF
)"
```

---

## Verification

```bash
bun run test:convex -- evals/rag/reports convex/_agents/chat/chunkContext.test.ts
bun run typecheck:convex
```

Expected: all tests pass, typecheck exit 0.

Loop 1 does **not** require a live smoke to merge, but labeling 20 judge rows is a human gate before Loop 3.
