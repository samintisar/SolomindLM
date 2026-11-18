# Agent ops control plane (v1)

**Date:** 2026-08-20  
**Status:** design — implement via three plans, in order  
**Canvas:** Cursor canvas `agent-ops-architecture.canvas.tsx` (local IDE companion, not in-repo).

## Goal

Maintain SolomindLM LangGraph agents for **accuracy**, **p95 latency**, and **token cost** as three loops that share telemetry and one promotion rule. Do not collapse them into a single GEPA/prompt-search score.

## Why not one optimizer

Accuracy, speed, and tokens are a Pareto front. Optimizing instructions against `evals/rag` gold will leak fixture knowledge (forbidden by AGENTS.md). Optimizing cost without a quality gate will shrink context until grounding fails. The existing eval loop is the **measurement plane**; this spec is the **control plane** that sits on it.

## Non-goals (verbatim constraints)

- Do not tune production prompts to pass RAG eval metrics (`expected_item_recall`, golden notebooks, `AGENTIC_20_ITEMS`).
- Do not put GEPA / MIPROv2 / DSPy compile on the smoke gate objective.
- Do not promote production traces into prompts.
- Do not run full live agents in CI (dry-run + unit tests only).
- Do not add a vision model just to green infographic smoke. Vision remains opt-in via `EVAL_VISION_JUDGE`.
- Production prompts must stay topic-agnostic (arbitrary user sources).

## Loops

| Loop | Owns | Ship when | Plan |
| ---- | ---- | --------- | ---- |
| **1 Quality** | Chunking, retrieve, rerank, select, parse, schedule, judge calibration, holdout promotion | Holdout grounding does not regress; smoke pipeline metrics honest | `docs/superpowers/plans/2026-08-20-agent-ops-loop-1-quality.md` |
| **2 Budget** | Stage spans, provider token usage, 20b/120b + skip-map policy, per-runner token gates, context packing metrics | Holdout accuracy held; latency/tokens improved or explained | `docs/superpowers/plans/2026-08-20-agent-ops-loop-2-budget.md` |
| **3 Compile** | Isolated instruction search for **one** module after Loop 1 says the failure is prompt-owned | Holdout accept; instructions remain topic-agnostic; **blocked** until judge agreement ≥ 0.8 | `docs/superpowers/plans/2026-08-20-agent-ops-loop-3-prompt-compile.md` |

## Shared telemetry

Every eval artifact (and later production logs) should carry:

- End-to-end `latencyMs`
- `tokenUsage: { prompt, completion, total }` with `tokenUsageSource: "provider" | "estimated"`
- Optional `stageSpans: AgentStageSpan[]` (`retrieve` \| `rerank` \| `select` \| `map` \| `reduce` \| `parse` \| `tts`)

Loop 2 introduces the types. Loop 1 may read spans if present but must not require them.

## Promotion rule

A change ships only if:

1. Holdout (`bun run eval:holdout`) does not add new `fail` on grounding / structure metrics vs the last tagged snapshot.
2. Smoke remains a **pipeline** gate (vision skipped unless opted in). Fixture list-enumeration may still fail until Loop 1 selection work lands — that is a known agent-quality gap, not a prompt-coaching ticket.
3. Token/latency may worsen **only** when holdout accuracy improved. Otherwise budget changes must be neutral or better.

Pairwise `eval:compare` is supporting evidence, not the promotion bit.

## Existing pieces to reuse

- Splits: `evals/rag/splits.ts` (`smoke` / `train` / `holdout`)
- Taxonomy: `evals/rag/reports/failureGrouper.ts`
- Judge queue: `evals/rag/reports/judgeQueue.ts` → `evals/rag/generated/judge-queue.json`
- Models: `FAST_LLM` = `openai/gpt-oss-20b`, `SMART_LLM` = `openai/gpt-oss-120b`
- Cache: `convex/_agents/_shared/cachedLlm.ts`, `cacheVersions`
- Chat selection: `selectChunksByTokenBudget*` in `convex/_agents/chat/chunkContext.ts` (`LIST_QUERY_MAX_SELECTED_CHUNKS = 12`)
- Eval token estimate (to replace): `estimateChatTokenUsage` in `convex/eval/chatEvalAction.ts`

## Implementation order

1. Loop 1 (measurement + selection honesty)  
2. Loop 2 (cost/latency knobs with holdout guard)  
3. Loop 3 (optional; do not start until Loop 1 calibration exists)

Each plan must produce working, testable software on its own. Loop 3 v1 is a **sandbox with a gold-leak detector** under `evals/rag/prompt-compile/`, not a DSPy dependency in the monorepo.
