# Loop 3 — Prompt-compile sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a **blocked** compile sandbox that refuses to search prompts until judge calibration is ready, and that refuses any metric whose source text mentions eval gold lists.

**Depends on:** Loop 1 Tasks 1–2 (`scoreJudgeCalibration`, `loadJudgeQueueFile`). Do not start this plan before those land.

**Architecture:** v1 is TypeScript in `evals/rag/prompt-compile/` (so existing `evals/rag/**/*.test.ts` vitest include picks it up). Not a DSPy/Python dependency, not wired to `convex/_agents` production prompts, and not invoked by smoke. The gate requires Loop 1 `readyForPromptCompile` and a gold-leak detector on metric source text.

**Tech Stack:** TypeScript, vitest, existing `scoreJudgeCalibration`. No `dspy` npm/pip package in this plan.

## Global Constraints

- Do not tune production prompts to pass RAG eval metrics.
- Do not import `evals/rag/prompt-compile` from `convex/_agents`.
- Do not add GEPA/MIPROv2 until a later plan; this plan only builds the gate.
- Forbidden in metric source and compile examples: `AGENTIC_20_ITEMS`, `expected_item_recall`, fixture filenames, notebook IDs from `evals/rag/fixtures`.
- Compile examples must be product-like questions with no gold name lists.

## File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `evals/rag/prompt-compile/goldLeak.ts` | Create | Detect forbidden eval-gold tokens |
| `evals/rag/prompt-compile/goldLeak.test.ts` | Create | TDD |
| `evals/rag/prompt-compile/compileGate.ts` | Create | Require Loop 1 calibration + no gold leak |
| `evals/rag/prompt-compile/compileGate.test.ts` | Create | TDD |
| `evals/rag/prompt-compile/cli.ts` | Create | `bun run evals/rag/prompt-compile/cli.ts` dry gate |
| `evals/rag/prompt-compile/README.md` | Create | How this relates to GEPA later |
| `package.json` | Modify | `eval:prompt-compile:gate` script |

---

### Task 1: Gold-leak detector

**Files:**
- Create: `evals/rag/prompt-compile/goldLeak.ts`
- Create: `evals/rag/prompt-compile/goldLeak.test.ts`

**Interfaces:**
- Produces: `findGoldLeaks(sourceText: string): string[]`

Forbidden substrings (case-insensitive):

```typescript
export const FORBIDDEN_GOLD_TOKENS = [
  "AGENTIC_20_ITEMS",
  "expected_item_recall",
  "expectedItems",
  "agentic-patterns-20",
  "ml-factoid-",
  "jd702jq641ensjca91c9hwp4d985pgax",
  "jd72h9qsq5zap11ede5k8rqkx585djmc",
] as const;
```

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import { findGoldLeaks } from "./goldLeak";

describe("findGoldLeaks", () => {
  it("returns empty for a topic-agnostic metric", () => {
    expect(findGoldLeaks("Score 1 if the answer only uses selected chunks.")).toEqual([]);
  });

  it("flags fixture gold and notebook ids", () => {
    const leaks = findGoldLeaks("Must list AGENTIC_20_ITEMS from agentic-patterns-20");
    expect(leaks).toContain("AGENTIC_20_ITEMS");
    expect(leaks).toContain("agentic-patterns-20");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test:convex -- evals/rag/prompt-compile/goldLeak.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: Implement**

```typescript
export const FORBIDDEN_GOLD_TOKENS = [
  "AGENTIC_20_ITEMS",
  "expected_item_recall",
  "expectedItems",
  "agentic-patterns-20",
  "ml-factoid-",
  "jd702jq641ensjca91c9hwp4d985pgax",
  "jd72h9qsq5zap11ede5k8rqkx585djmc",
] as const;

export function findGoldLeaks(sourceText: string): string[] {
  const lower = sourceText.toLowerCase();
  return FORBIDDEN_GOLD_TOKENS.filter((token) => lower.includes(token.toLowerCase()));
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add evals/rag/prompt-compile/goldLeak.ts evals/rag/prompt-compile/goldLeak.test.ts
git commit -m "$(cat <<'EOF'
feat: refuse prompt-compile metrics that mention eval gold

EOF
)"
```

---

### Task 2: Compile gate (calibration + leaks)

**Files:**
- Create: `evals/rag/prompt-compile/compileGate.ts`
- Create: `evals/rag/prompt-compile/compileGate.test.ts`

**Interfaces:**
- Consumes: `JudgeCalibrationScore` from `evals/rag/reports/judgeCalibration.ts`, `findGoldLeaks`
- Produces:

```typescript
export function assertPromptCompileAllowed(input: {
  calibration: JudgeCalibrationScore;
  metricSource: string;
  instructionDraft?: string;
}): { ok: true } | { ok: false; reasons: string[] }
```

Rules:
- If `!calibration.readyForPromptCompile` → reason `"judge calibration not ready"`
- If `findGoldLeaks(metricSource)` nonempty → reason `"metric source leaks gold: ..."`
- If `instructionDraft` leaks → reason `"instruction draft leaks gold: ..."`

- [ ] **Step 1: Tests** — not ready; ready + clean; ready + leak.

Use a calibration object `{ labeled: 20, unlabeled: 0, agreed: 16, agreement: 0.8, readyForPromptCompile: true }`.

- [ ] **Step 2: Run fail**

- [ ] **Step 3: Implement `assertPromptCompileAllowed`**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: block prompt compile until judges are calibrated and gold-free

EOF
)"
```

---

### Task 3: CLI gate + README

**Files:**
- Create: `evals/rag/prompt-compile/cli.ts`
- Create: `evals/rag/prompt-compile/README.md`
- Modify: `package.json`

CLI args: `--queue <judge-queue.json>` and `--metric-file <path>` (utf8 source to scan). Exit 2 if gate fails, 0 if allowed. **Do not call an LLM.**

```typescript
import { readFileSync } from "fs";
import { loadJudgeQueueFile } from "../rag/reports/judgeQueueFile";
import { scoreJudgeCalibration } from "../rag/reports/judgeCalibration";
import { assertPromptCompileAllowed } from "./compileGate";

const queuePath = argAfter("--queue");
const metricPath = argAfter("--metric-file");
const calibration = scoreJudgeCalibration(loadJudgeQueueFile(queuePath));
const metricSource = readFileSync(metricPath, "utf8");
const decision = assertPromptCompileAllowed({ calibration, metricSource });
if (!decision.ok) {
  console.error(decision.reasons.join("\n"));
  process.exit(2);
}
console.log("Prompt compile gate passed. No optimizer is wired in v1.");
```

Implement `argAfter` as a 10-line argv helper in the same file.

package.json:

```json
"eval:prompt-compile:gate": "bun run evals/rag/prompt-compile/cli.ts"
```

README.md contents:

```markdown
# Prompt-compile sandbox (Loop 3)

This directory is **not** production. It does not change `convex/_agents` prompts.

v1 only checks:
1. Loop 1 judge calibration (`readyForPromptCompile`)
2. Metric/instruction text does not mention eval gold

A later plan may add DSPy GEPA / MIPROv2 **outside** this repo or behind an optional extra, compiling **one** signature (citation format or abstention) on product-like questions with a frozen holdout. Production landing requires topic-agnostic instructions and Loop 1 `--promotion-check`.

Do not run this from smoke CI.
```

- [ ] **Step 1:** Add `evals/rag/prompt-compile/cli.test.ts` that writes a temp queue + metric file and imports a `runCompileGateCli(argv: string[]): number` exported from `cli.ts` (refactor CLI to export `runCompileGateCli` for tests). Expect exit 2 when unlabeled.

- [ ] **Step 2:** Run fail

- [ ] **Step 3:** Implement CLI + README + script

- [ ] **Step 4:** Tests pass

- [ ] **Step 5: Commit**

```bash
git add evals/rag/prompt-compile package.json
git commit -m "$(cat <<'EOF'
feat: prompt-compile gate CLI without an optimizer

EOF
)"
```

---

## Out of scope (next plan, not this one)

- Adding the `dspy` Python package or GEPA reflection LM
- Rewriting ChatAgent as a DSPy module
- Any change under `convex/_agents/**` prompt strings

## Verification

```bash
bun run test:convex -- evals/rag/prompt-compile
```

Expected: PASS. Live compile search is **not** part of this plan.
