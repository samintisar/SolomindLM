# Eval harness — improvement scopes

**Date:** 2026-10-17
**Status:** scoping (no code changed)
**Goal of the harness:** an autonomous improvement loop — a run should tell a coding agent *what is
broken, in which stage, in which files*, and a re-run should prove the fix without a human reading
transcripts. Every scope below is judged by whether it moves us toward that.

For an autonomous loop the harness needs five properties. Today's state of each:

| Property | Needed because | Today |
|---|---|---|
| **Honest signal** | A false pass hides a bug; a false fail sends the agent chasing ghosts | Several metrics inflate or are hollow (F1–F4) |
| **Diagnostic** | The agent must know *which stage* to fix | Good for chat (3 retrieval snapshots + blame rules); weak for studio |
| **Reproducible / low-variance** | Must tell regression from noise with 1 run per case | No repeats, rerank cache shared with prod, non-deterministic HyDE |
| **Experimentable** | The agent must be able to try a config and measure it | Only `--smart-llm` (studio); chat knobs are compile-time strings |
| **Historical** | Drift and slow regressions are invisible in a single report | Reports are written to `--output` and forgotten; CI is dry-run only |

---

## 1. What exists (don't rebuild)

`evals/rag/` is ~12.5k LOC and already has the right skeleton: fixture → runner → artifact →
metrics → report. Keep all of it.

- **Fixtures:** 1 agentic + ~50 ML (NotebookLM-generated, 10 scenario categories) + 9 research +
  5 LR + 18 studio + 4 use-case packs (42 fixtures, openly licensed sources, seeded, rubric-judged).
- **Splits:** `smoke` / `train` / `holdout` (`splits.ts`), explicit on pack fixtures.
- **Artifacts:** pre-rerank / post-rerank / selected chunks, sub-queries, failed sub-queries,
  latency, `tokenUsage` + `tokenUsageSource`, `stageSpans`, `configHash`.
- **Deterministic metrics:** item recall, retrieval recall ×3 stages, precision@K, nDCG@K,
  abstention blame rules, citation validity, latency/token gates, studio invariants, 16 LR funnel
  metrics.
- **Judges:** binary per failure mode (DeepSeek-V4.1-Flash, JSON mode, evidence = exact passages the
  model saw, truncation disclosed), rubric judges per pack (prompt-cache-friendly layout), pairwise
  compare with position swap, Likert off by default.
- **Loop plumbing:** `failureGrouper` (13 categories → target files), judge calibration queue +
  scorer (≥20 labels, ≥0.8 agreement), `--promotion-check` on holdout, `--compare` on artifact dirs,
  RAGAS bridge.
- **Verified in this session:** `eval:rag:dry` and `eval:usecases:dry` pass; 251 harness unit tests
  pass (`vitest run --config vitest.convex.config.ts evals/rag`).

---

## 2. Findings (verified against source, with locations)

### Signal honesty

**F1. `expected_item_recall` has a ~20–25 % noise floor.** The fuzzy matcher
(`evals/rag/metrics/index.ts:93-129`) credits any single word ≥4 chars from the item and any synonym
in `SYNONYM_MAPPINGS`. Probe: an answer that *abstains and names zero patterns* scores 0.20 on
`agentic-patterns-20` — "agent" matches two items, the synonym `"to"` (line 50) matches
"reasoning techniques", "patterns" matches "guardrails and safety patterns". A 15/20 answer can read
≥0.9 (pass). This metric is the smoke gate's headline number.

**F2. `binary_judge_studio_grounding` is a coherence check, not a grounding check.** Studio artifacts
always set `selectedChunks: []` (`evals/rag/runners/studioRunner.ts:264`), so the judge takes the
"No chunks available — pass if output is coherent" branch (`binaryJudges.ts:218-222`). It is one of
the five metrics that gate promotion (`reports/promotion.ts:3-9`).

**F3. Cost gates are inert.** All seven committed baselines carry `tokenUsage.total: 0`
(`evals/rag/baselines/*.json`, April 2026), so the token ratio is always 0 and only latency is
compared. Chat `tokenUsage` falls back to a chars/4 estimate of question + chunks + answer
(`convex/eval/chatEvalAction.ts:63-76`) that omits the ~9.6k-char system prompt, planner, HyDE and
follow-up calls. `contextTokenBudgetRatio` divides by a hard-coded 8000 for every chat case.

**F4. `configHash` under-covers.** It hashes only the `CHAT_*` env strings
(`evals/rag/configHash.ts`); neighbour/opening/multi-source budgets, model IDs, chunk size and prompt
versions are outside it, so two runs with different behaviour can share a hash.

### Consistency

**F5. One run per case, no variance.** The CLI runs fixtures sequentially, once
(`cli.ts:563-651`). No `pass^k`, no σ, no flaky-case detection. Judge temperature is 0.1 with
reasoning on by default; production HyDE/planner are temp 0.1 and uncached. A single-run delta cannot
be attributed to a change.

**F6. Evals share the production rerank cache.** `createRerankFn(ctx)` is the cached action
(`rerank-v3-voyage`, 15 min TTL; `chatEvalAction.ts:170`). Repeat runs within the TTL get cached
scores and a collapsed `rerank` span.

### Token efficiency (production, measurable by the harness)

**F7. Production never persists token usage.** `_streamChatResponse.ts:302-307` ignores
`done.data.tokenUsage`. The accumulator exists (`tokenUsageAccumulator.ts`) but excludes embeddings
(query, HyDE, 2× grounding) and Voyage rerank.

**F8. Known waste, none of it currently measured:**
- Few-shot block (~2.4k chars) is added whenever `conversationHistory.length === 0`
  (`llm_wrapper.ts:418`); default mode always passes `[]` (`ChatAgent.ts:607-608`), so it is sent on
  every turn. Citation/math rules are repeated in the user prompt.
- Vector search re-runs with the *same* HyDE embedding for each of up to 3 keyword variants
  (`ChatAgent.ts:427-448`); only the keyword leg differs.
- Full-document expansion is uncapped and fires on ≥10 pooled chunks from one doc
  (`ChatAgent.ts:251`), common with 220-token chunks; the selector admits it "over budget".
- Up to 6 HyDE calls + 6 embeddings per turn; follow-up generation runs in evals too.
- Context ceiling is 8000 + 12000 (multi-source) + 2000 (neighbours) + 3000 (openings) tokens; the
  7000-token budget in `llm_wrapper.ts` only warns.

**F9. Dead knobs.** `convex/_lib/env.ts:50-71` are fixed strings, not `process.env` reads;
`CHAT_VECTOR_MATCH_THRESHOLD`, `CHAT_LLM_TEMPERATURE`, `CHAT_RERANK_TOP_N/THRESHOLD`,
`SUBQUERY_POOL_MULTIPLIER` have no effect on the main path. The real vector threshold is hard-coded
at `convex/chat/_streamSearch.ts:20`. `cacheVersions` (schema.ts:467) has no readers or writers.

### Coverage

**F10. Retrieval is unscored for most fixtures.** precision@K, nDCG@K and abstention blame all
require `expectedItems`; ~40 of ~50 ML fixtures have `expectedItems: []` and pass them trivially. For
those cases the harness cannot tell a retrieval miss from a generation miss.

**F11. Missing case types:** unanswerable (should abstain) — only wrong-abstention is scored;
multi-turn — eval always sends empty history (`chatEvalAction.ts:356`); paraphrase consistency;
production-parity options (`smartModel`, notebook instructions, `outputLanguage`, learning-guide mode
are never passed, `chatEvalAction.ts:211-217`).

### Judge trust

**F12. Calibration labels are never persisted.** `judge-queue.json` lives in the gitignored
`evals/rag/generated/`; `readyForPromptCompile` can never accumulate across sessions. Pairwise
compare shows the judge only question + two answers (`compare.ts:55-67`), no sources — so it rewards
fluent, possibly ungrounded text.

---

## 3. Scopes

Effort: S ≤ 1 day, M ≤ 1 week, L > 1 week. "Loop" = required before the harness can drive an
autonomous fix loop safely.

### Scope A — Honest signal (Loop, do first)

| # | Change | Files | Effort |
|---|---|---|---|
| A1 | Whole-word matching in `containsFuzzy`; drop synonyms < 4 chars and generic words ("to", "chain", "plan", "tool", "memory", "testing", "security", "research"); require ≥2 significant words for multi-word items or an exact synonym. Add a unit test that an abstaining answer scores 0. Re-baseline `agentic-patterns-20` expectations. | `metrics/index.ts` | S |
| A2 | Give studio artifacts their evidence: have the studio eval action return the chunks the map/reduce phases actually read (they exist in the job phases) as `selectedChunks`; fall back to pack `sourceTexts` in the binary grounding judge the way rubric judges already do. Then `binary_judge_studio_grounding` becomes real. | `convex/eval/studioEvalAction.ts`, `runners/studioRunner.ts`, `metrics/binaryJudges.ts` | M |
| A3 | Re-snapshot baselines with provider token usage (after C1); fail `latency_cost_budget` loudly when `tokenUsageSource === "estimated"` on a gate rather than silently passing. | `baselines/`, `metrics/index.ts` | S |
| A4 | Widen `configHash` to a `RetrievalConfigSnapshot` built from `chatConfig.ts` constants + model IDs + `RAG_CHUNK_SIZE_TOKENS` + a prompt version string. | `configHash.ts`, `types.ts` | S |

Acceptance: abstaining answer → recall 0; a studio run with no grounding evidence cannot pass the
grounding judge; two runs with different context budgets have different hashes.

### Scope B — Consistency (Loop)

| # | Change | Files | Effort |
|---|---|---|---|
| B1 | `--repeats N` (default 1; smoke 3). Per metric emit `mean`, `stdev`, `passAll` (pass^k) and `passAny`. Report marks a case **flaky** when verdicts disagree across repeats and excludes flaky fails from `--promotion-check` regressions (they become a separate "flaky" bucket). | `cli.ts`, `reports/*`, `types.ts` | M |
| B2 | Rerank cache isolation: `chatEvalAction` passes a `cacheNamespace: "eval-<runId>"` (or bypass flag) to `createRerankFn`. | `convex/chat/_streamSearch.ts`, `chatEvalAction.ts` | S |
| B3 | Judge self-consistency: run each binary judge twice on a 10 % sample; report judge agreement alongside human agreement. Default `--judge-reasoning off` for smoke (cheaper and more deterministic); keep reasoning for holdout. | `metrics/binaryJudges.ts`, `scorers.ts` | S |
| B4 | Run fixtures with bounded concurrency (3–4) so repeats don't triple wall time; respect the existing judge-group serialisation per case. | `cli.ts` | S |

Acceptance: `eval:rag:smoke` with `--repeats 3` prints pass^3 per case; a config change on a flaky
case does not block promotion; a stable regression does.

### Scope C — Token efficiency: measure, then experiment (Loop for the budget axis)

Measurement first — none of the experiments below can be judged without C1–C3.

| # | Change | Files | Effort |
|---|---|---|---|
| C1 | Persist provider `tokenUsage` in production (`messages.metadata.tokenUsage`) and return it from the eval action; count embedding calls (×1536-dim) and rerank docs as separate `embeddingCalls` / `rerankDocs` counters. Read `prompt_tokens_details.cached_tokens` in `fromTogetherUsage`. | `_streamChatResponse.ts`, `tokenUsageAccumulator.ts`, `chatEvalAction.ts` | S–M |
| C2 | Add stage spans with token usage for `plan`, `hyde`, `generate`, `grounding`, `followup` (extend `AgentStageName`). `stageTokenShare` then works for chat. | `stageSpans.ts`, `llm_wrapper.ts`, `chatEvalTelemetry.ts` | M |
| C3 | Chat config override surface for evals: `ChatEvalResult` args accept `configOverrides` (context budget, list budget, neighbour/opening budgets, HyDE on/off, max sub-queries, keyword variants, full-doc expansion cap, few-shot policy, rerank on/off). Thread through `ChatAgent` constructor options; CLI `--chat-config key=val,…`; include in `configHash`. | `chatConfig.ts` → options object, `ChatAgent.ts`, `chatEvalAction.ts`, `cli.ts` | M |
| C4 | `eval:sweep`: run a grid of `--chat-config` values over the `train` split, export artifacts per cell, emit a Pareto table (grounding pass-rate × tokens × p95 latency) and `--compare` the best cell against baseline. | `evals/rag/sweep.ts` (new) | M |

Experiments to run once C1–C3 land, ranked by expected saving ÷ risk (hypothesis → metric):

1. **Cap full-document expansion** at the context budget and dedupe the 55-token overlaps when
   joining chunks → prompt tokens ↓ on single-source notebooks; grounding unchanged.
2. **Few-shot only on complex queries** (drop the `history.length === 0` trigger) → ~600 prompt
   tokens/turn ↓; watch `binary_judge_chat_grounding` and citation validity.
3. **Run vector search once per sub-query**, reuse across keyword variants → latency ↓,
   Convex reads ↓; retrieval recall unchanged by construction.
4. **HyDE gating**: skip HyDE for factoid/short queries (planner already classifies) → up to 6
   fast-model calls ↓; watch `retrieval_item_recall_pre_rerank` by scenario category.
5. **Prompt-cache layout**: move the date line and dynamic parts to the end of the system prompt;
   measure `cached_tokens` share (C1) → input cost ↓ with zero quality risk.
6. **Chunk size 220 → 350–450 tokens** (never re-tuned since the E5 migration) → fewer chunks per
   budget, fewer near-duplicates; needs full re-embed of pack notebooks (`eval:seed --reingest`), so
   run on packs only, compare precision@K / nDCG and grounding.
7. **Skip follow-up generation in eval mode** → removes non-answer tokens from the cost metric.

### Scope D — Retrieval quality gold (Loop for the retrieval axis)

| # | Change | Files | Effort |
|---|---|---|---|
| D1 | `expectedPassages?: string[]` on fixtures: short verbatim quotes from the source that a correct answer needs. Deterministic chunk relevance = chunk contains a quote (normalised). Unlocks precision@K / nDCG / blame rules for prose fixtures. Start with the 4 packs (sources are in-repo, so quotes are checkable by `validatePack`). | `types.ts`, `metrics/index.ts`, pack `fixtures.ts`, `usecases/validate.ts` | M |
| D2 | LLM-labelled context relevance (RAGAS `context_precision` style) as an *info* metric for fixtures without D1 labels: judge each selected chunk "needed / not needed" once, cache by chunk id + question. | `metrics/contextRelevance.ts` (new) | M |
| D3 | Retrieval-only runner (`--runner retrieve`): run plan + search + rerank + select without generation. 10× cheaper; lets sweeps (C4) over retrieval knobs iterate fast. | `chatEvalAction.ts` (flag), `runners/` | S–M |
| D4 | Pipeline fixes to evaluate with D1–D3: embed heading text with chunk content (headings are stripped, `StructuralChunker.ts:176-196`); keyword leg filtered to selected docs *before* `.take(50)` and given a real score; RRF threshold vs keyword rank cutoff. | `convex/_services/processing/StructuralChunker.ts`, `convex/documents/internal.ts`, `hybrid_search.ts` | M |

### Scope E — Coverage

| # | Change | Effort |
|---|---|---|
| E1 | **Unanswerable set**: 2 per pack, `expectedBehavior: abstain`, new metric `abstention_correctness` rule 5 — answered confidently when sources lack it → fail (`hallucination_under_pressure`). Judge gets the full pack source text so it can confirm absence. | S |
| E2 | **Multi-turn fixtures**: `turns: [{user, assistantRef?}]`; eval action accepts `conversationHistory` and `chatSettings.instructionMode: "learningGuide"` (the only mode that uses history). Score the last turn; add `history_token_share`. | M |
| E3 | **Paraphrase triples**: `variants: string[]` on a fixture → N runs, metric `paraphrase_consistency` = fraction of variants with the same pass/fail on grounding + recall. | S |
| E4 | **Production parity**: pass `smartModel`, notebook instructions, `outputLanguage` from the fixture; call the real `discoverChatExternalSources` instead of the eval-only copy. | S–M |
| E5 | **Migrate legacy ML / agentic fixtures to packs** (reproducible on any deployment) — blocked on confirming source licences; if not open, keep them as a "private" pack that `validatePack` allows to be unseeded. | M |

### Scope F — Judge trust

| # | Change | Effort |
|---|---|---|
| F1 | Version calibration labels: `evals/rag/calibration/<judge>.jsonl` committed; `--score-judge-queue` merges all files; report per-judge agreement and Cohen's κ, not one global number. Gate *each* judge's blocking status on its own κ. | S |
| F2 | Pairwise compare gets the evidence (selected chunks of both runs, deduped) and a length-controlled instruction; keep position swap. | S |
| F3 | Judge prompts for `studio_structure` / `studio_grounding` are three lines; give them the same rubric-style framing and evidence rules as chat judges once A2 lands. | S |

### Scope G — Autonomy infrastructure

| # | Change | Effort |
|---|---|---|
| G1 | **Nightly live smoke** GitHub Actions workflow (`schedule:`), secrets `RAG_EVAL_CONVEX_URL`, `RAG_EVAL_SECRET`, `TOGETHER_AI_API_KEY`; runs `eval:rag:smoke --repeats 3 --output` + `eval:usecases`; uploads report + artifacts; posts a summary; fails on new `fail` vs the last stored report. PRs stay dry-run. | S–M |
| G2 | **History store**: append each report's per-metric pass/score to `evals/rag/history/<split>.jsonl` (or a Convex `evalRuns` table on dev); `eval:trend` prints 14-day deltas per metric × runner × pack and flags monotone decline. | M |
| G3 | **Agent work order**: `--output-workorder` writes `failureGroups` as a markdown task list (category, cases, trace hints, target files, the exact re-run command) — the input to a coding agent. Pair with a `/eval-fix` skill: run smoke → read work order → fix within the allowed pipeline files → re-run `--case` → run holdout `--promotion-check`. Prompt files are excluded from the allowed set by default (AGENTS.md). | S |
| G4 | **Production sampling (later, needs consent/privacy design)**: nightly job samples N anonymised chat turns from dev/staging, runs reference-free judges (grounding, citation), appends to history. This is the drift detector; the v1 spec listed it as a non-goal — revisit after G1–G3. | L |

---

## 4. Sequencing

**Phase 1 — make the signal trustworthy (≈1 week):** A1, A4, B2, B3, C1, F1, G1.
After this, a red smoke means something and a nightly run exists.

**Phase 2 — make it diagnostic and experimentable (≈2 weeks):** A2, A3, B1, B4, C2, C3, D3, E1,
F2. After this, `--repeats` + `--chat-config` + `--compare` let an agent (or you) run experiments
1–5 from Scope C with attributable results.

**Phase 3 — close the loop (≈2 weeks):** C4, D1, D2, E2–E4, G2, G3. Then D4 and experiment 6
(chunk size) as the first *pipeline* changes driven entirely by the harness.

## 5. What was not possible in this session

No `RAG_EVAL_CONVEX_URL`, `RAG_EVAL_SECRET` or `TOGETHER_AI_API_KEY` are available here, so no live
eval or experiment ran. Everything above is from reading the code, the dry-run, the unit tests and
one probe script (`expected_item_recall` noise floor). First commands to run with secrets, to get a
real baseline before any change:

```bash
bun run eval:rag:smoke -- --output evals/rag/generated/smoke-$(git rev-parse --short HEAD).json --verbose
bun run eval:rag:train:snapshot            # artifacts for later --compare
bun run eval:holdout -- --output evals/rag/generated/holdout-$(git rev-parse --short HEAD).json
bun run eval:usecases -- --output evals/rag/generated/usecases-$(git rev-parse --short HEAD).json
```

Keep these four files: they are the "before" for every `--compare` and `--promotion-check` in
Phase 2.
