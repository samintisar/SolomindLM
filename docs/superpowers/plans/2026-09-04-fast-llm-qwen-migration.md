# Fast LLM Qwen Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated GPT-OSS 20B fast-model configuration with non-reasoning `Qwen/Qwen3.5-9B`, and replace the Qwen chat-picker option with reasoning-enabled `Qwen/Qwen3.8-Flash`.

**Architecture:** Keep fast-model configuration environment-driven, with Qwen 3.5 as the non-reasoning fallback value. Teach the shared Together LLM factory to use Qwen 3.5 with reasoning disabled, Qwen 3.8 Flash with reasoning enabled for chat's smart phase, and retain the existing GPT-OSS compatibility behavior for deliberate legacy overrides. Centralize the evaluator's Qwen 3.5 default so all evaluators use the same model identifier.

**Tech Stack:** TypeScript, Convex, LangChain `ChatTogetherAI`, Together AI SDK, Vitest, Bun, Biome.

---

## File structure

- `convex/_lib/env.ts` — production fallback for `FAST_LLM`.
- `convex/_agents/_shared/llm_factory.ts` — model-family-specific Together request options and fallback map model.
- `convex/_agents/_shared/llm_factory.test.ts` — unit coverage for Qwen and legacy GPT-OSS request options.
- `convex/_agents/agentGraphs.smoke.test.ts` — graph-construction fixture's fast model.
- `evals/rag/metrics/llmJudge.ts` — canonical Qwen LLM-judge default.
- `evals/rag/metrics/literatureReview.ts` — literature-review judge calls that consume the canonical default.
- `evals/rag/metrics/togetherLlmJudge.ts` — Qwen preset replacing the obsolete GPT-OSS 20B preset.
- `evals/rag/metrics/llmJudge.test.ts` — default-model metadata coverage.
- `apps/web/src/shared/constants/models.ts` — chat model-picker catalog.
- `apps/web/src/shared/constants/models.test.ts` — model-picker catalog coverage.
- `.env.example`, `README.md`, `AGENTS.md`, `CLAUDE.md`, and `convex/_agents/_shared/logging.ts` — current operator guidance and example configuration.

### Task 1: Cover Qwen request options in the shared LLM factory

**Files:**
- Modify: `convex/_agents/_shared/llm_factory.test.ts`

- [ ] **Step 1: Add the failing Qwen model-kwargs test**

Add this case to the `mergeModelKwargs` suite before the non-OpenAI fallback test:

```ts
it("uses non-reasoning Qwen 3.5 and reasoning-enabled Qwen 3.8 Flash", () => {
  expect(mergeModelKwargs("Qwen/Qwen3.5-9B", "fast")).toEqual({
    reasoning: { enabled: false },
  });
  expect(mergeModelKwargs("Qwen/Qwen3.5-9B", "smart")).toEqual({
    reasoning: { enabled: false },
  });
  expect(mergeModelKwargs("Qwen/Qwen3.8-Flash", "fast")).toEqual({
    reasoning: { enabled: false },
  });
  expect(mergeModelKwargs("Qwen/Qwen3.8-Flash", "smart")).toEqual({
    reasoning: { enabled: true },
  });
});
```

- [ ] **Step 2: Verify the new test fails**

Run:

```bash
bun x vitest run --config vitest.convex.config.ts convex/_agents/_shared/llm_factory.test.ts
```

Expected: FAIL because Qwen currently receives `chat_template_kwargs`.

- [ ] **Step 3: Update existing constructor fixtures to exercise Qwen**

Change the `createLLMs` and default-phase `createLLM` fixtures from
`openai/gpt-oss-20b` to `Qwen/Qwen3.5-9B`, and update their expected options:

```ts
model: "Qwen/Qwen3.5-9B",
modelKwargs: { reasoning: { enabled: false } },
```

Keep the existing GPT-OSS 20B and 120B `reasoning_effort` expectations in the
dedicated legacy-model test so explicit deployment overrides remain supported.

- [ ] **Step 4: Implement Qwen-specific model kwargs**

In `convex/_agents/_shared/llm_factory.ts`, add a Qwen 3.5 condition before
the generic non-OpenAI fallback and revise the JSDoc to describe its request
shape:

```ts
if (model === "Qwen/Qwen3.5-9B") {
  return { reasoning: { enabled: false } };
}
if (model === "Qwen/Qwen3.8-Flash") {
  return { reasoning: { enabled: phase === "smart" } };
}
```

Do not alter the GPT-OSS branch; it must continue to return:

```ts
{ reasoning_effort: phase === "fast" ? "low" : "medium" }
```

- [ ] **Step 5: Verify the factory tests pass**

Run:

```bash
bun x vitest run --config vitest.convex.config.ts convex/_agents/_shared/llm_factory.test.ts
```

Expected: PASS, including Qwen fast/smart settings and legacy GPT-OSS coverage.

- [ ] **Step 6: Commit the isolated factory change**

```bash
git add convex/_agents/_shared/llm_factory.ts convex/_agents/_shared/llm_factory.test.ts
git commit -m "fix: support Qwen fast model options"
```

### Task 2: Set Qwen as the active runtime fast-model fallback

**Files:**
- Modify: `convex/_lib/env.ts`
- Modify: `convex/_agents/_shared/llm_factory.ts`
- Modify: `convex/_agents/agentGraphs.smoke.test.ts`

- [ ] **Step 1: Update the graph smoke fixture**

Update the graph smoke-test fixture:

```ts
const MAP_MODEL = "Qwen/Qwen3.5-9B";
```

- [ ] **Step 2: Change both production fallback locations**

Replace the defaults with the exact Together model identifier:

```ts
FAST_LLM: process.env.FAST_LLM || "Qwen/Qwen3.5-9B",
```

```ts
mapModel: options.mapModel || env.FAST_LLM || "Qwen/Qwen3.5-9B",
```

Do not change `SMART_LLM` or feature-specific smart-model overrides.

- [ ] **Step 3: Re-run the focused tests**

Run:

```bash
bun x vitest run --config vitest.convex.config.ts convex/_agents/_shared/llm_factory.test.ts convex/_agents/agentGraphs.smoke.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the runtime default change**

```bash
git add convex/_lib/env.ts convex/_agents/_shared/llm_factory.ts convex/_agents/_shared/llm_factory.test.ts convex/_agents/agentGraphs.smoke.test.ts
git commit -m "fix: default fast LLM to Qwen 3.5"
```

### Task 3: Centralize evaluator defaults on Qwen

**Files:**
- Modify: `evals/rag/metrics/llmJudge.ts`
- Modify: `evals/rag/metrics/llmJudge.test.ts`
- Modify: `evals/rag/metrics/literatureReview.ts`
- Modify: `evals/rag/metrics/togetherLlmJudge.ts`

- [ ] **Step 1: Add a failing evaluator-default test**

In `llmJudgeCorrectness` tests, add:

```ts
it("records Qwen 3.5 as the default judge model", async () => {
  const result = await llmJudgeCorrectness(judgeFixture, judgeArtifact, {
    invoke: async () => '{"score":0.9,"reasoning":"good","hallucinations":[],"missing":[]}',
  });

  expect(result.breakdown).toMatchObject({
    model: "Qwen/Qwen3.5-9B",
  });
});
```

- [ ] **Step 2: Verify the evaluator test fails**

Run:

```bash
bun x vitest run --config vitest.convex.config.ts evals/rag/metrics/llmJudge.test.ts
```

Expected: FAIL because the result currently records GPT-OSS 20B.

- [ ] **Step 3: Introduce one canonical evaluator model constant**

In `llmJudge.ts`, export:

```ts
export const DEFAULT_LLM_JUDGE_MODEL = "Qwen/Qwen3.5-9B";
```

Use it in the option documentation, `defaultLlmInvoke`, and each
`options.model ??` fallback. Import it into `literatureReview.ts` and replace
each direct GPT-OSS 20B judge configuration:

```ts
const invoker = createTogetherJudgeInvoker({ model: DEFAULT_LLM_JUDGE_MODEL });
```

- [ ] **Step 4: Replace the obsolete selectable judge preset**

In `togetherLlmJudge.ts`, import `DEFAULT_LLM_JUDGE_MODEL` and replace the
`gptOss20b` preset with:

```ts
/** Qwen 3.5 9B: fast alternative */
qwen35_9b: {
  model: DEFAULT_LLM_JUDGE_MODEL,
  temperature: 0.1,
  maxTokens: 1024,
},
```

Retain `gptOss120b`; the requested deprecation concerns only GPT-OSS 20B.

- [ ] **Step 5: Verify evaluator tests pass**

Run:

```bash
bun x vitest run --config vitest.convex.config.ts evals/rag/metrics/llmJudge.test.ts
```

Expected: PASS. The test must prove the default model metadata is
`Qwen/Qwen3.5-9B`.

- [ ] **Step 6: Commit evaluator migration**

```bash
git add evals/rag/metrics/llmJudge.ts evals/rag/metrics/llmJudge.test.ts evals/rag/metrics/literatureReview.ts evals/rag/metrics/togetherLlmJudge.ts
git commit -m "fix: migrate RAG judges to Qwen 3.5"
```

### Task 4: Replace the Qwen chat-picker option

**Files:**
- Modify: `apps/web/src/shared/constants/models.ts`
- Modify: `apps/web/src/shared/constants/models.test.ts`

- [ ] **Step 1: Add a failing Qwen 3.8 Flash catalog test**

Add a test to the `smart model catalog` suite:

```ts
test("lists Qwen 3.8 Flash instead of Qwen 3.7 Max", () => {
  expect(findSmartModelById("Qwen/Qwen3.8-Flash")).toMatchObject({
    id: "Qwen/Qwen3.8-Flash",
    name: "Qwen3.8 Flash",
    brand: "qwen",
  });
  expect(findSmartModelById("Qwen/Qwen3.7-Max")).toBeUndefined();
});
```

- [ ] **Step 2: Verify the catalog test fails**

Run:

```bash
bun --cwd apps/web x vitest run src/shared/constants/models.test.ts
```

Expected: FAIL because the catalog currently exposes Qwen 3.7 Max.

- [ ] **Step 3: Replace the Qwen chat model entry**

In `AVAILABLE_SMART_MODELS`, replace the Qwen 3.7 Max entry with:

```ts
{
  id: "Qwen/Qwen3.8-Flash",
  name: "Qwen3.8 Flash",
  description: "Hybrid reasoning model with 1M context",
  brand: "qwen",
},
```

The chat wrapper already calls `mergeModelKwargs(config.model, "smart")`; the
Qwen 3.8 Flash branch from Task 1 therefore enables reasoning for this
selected chat model.

- [ ] **Step 4: Verify the catalog test passes**

Run:

```bash
bun --cwd apps/web x vitest run src/shared/constants/models.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the chat-picker migration**

```bash
git add apps/web/src/shared/constants/models.ts apps/web/src/shared/constants/models.test.ts
git commit -m "feat: add Qwen 3.8 Flash to chat models"
```

### Task 5: Update active operator documentation and examples

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `convex/_agents/_shared/logging.ts`

- [ ] **Step 1: Replace current fast-model guidance**

Use `Qwen/Qwen3.5-9B` for `FAST_LLM` in `.env.example` and the README:

```env
FAST_LLM=Qwen/Qwen3.5-9B
```

Update the AI-services sentence in both agent-instruction files to name
Qwen 3.5 9B as the fast model. Update the logging JSDoc example to use the
same identifier.

- [ ] **Step 2: Check no active GPT-OSS 20B references remain**

Run:

```bash
rg "gpt-oss-20b" --glob "!docs/superpowers/**" --glob "!.agents/**"
```

Expected: no results. Historical design records and bundled provider-reference
materials are intentionally excluded.

- [ ] **Step 3: Commit the documentation migration**

```bash
git add .env.example README.md AGENTS.md CLAUDE.md convex/_agents/_shared/logging.ts
git commit -m "docs: update fast LLM to Qwen 3.5"
```

### Task 6: Validate and update Convex environment variables

**Files:**
- No repository files.

- [ ] **Step 1: Run all required local verification gates**

Run these commands sequentially:

```bash
bun run typecheck:web
bun run typecheck:convex
bun run lint
bun run test:convex
```

Expected: all commands exit successfully. Resolve failures before changing a
hosted environment.

- [ ] **Step 2: Update and confirm the development environment**

Run:

```bash
bun x convex env set FAST_LLM Qwen/Qwen3.5-9B --deployment dev
bun x convex env get FAST_LLM --deployment dev
```

Expected: the second command returns `Qwen/Qwen3.5-9B`.

- [ ] **Step 3: Update and confirm the production environment**

Run:

```bash
bun x convex env set FAST_LLM Qwen/Qwen3.5-9B --prod
bun x convex env get FAST_LLM --prod
```

Expected: the second command returns `Qwen/Qwen3.5-9B`. The connected
production integration is read-only, so use the authenticated local CLI or
Convex dashboard if the integration rejects this operation.

- [ ] **Step 4: Confirm the final diff is scoped**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: only the intended migration commits are present; do not add or
modify the pre-existing `archive/SolomindLM_Creator_Brief.pdf`.
