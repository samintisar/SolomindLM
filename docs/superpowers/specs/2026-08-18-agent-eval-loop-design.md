# Agent eval loop design (v1)

**Date:** 2026-08-18  
**Status:** implemented in `evals/rag/`

## Goal

Offline closed loop for all runners (chat, research, literature review, studio): train/holdout splits, binary failure-mode judges, pairwise iter compare — without production traces or GEPA.

## Judge model

- **Binary judges + pairwise compare:** `deepseek-ai/DeepSeek-V4-Flash-0731` (Together JSON mode)
- **Production agents:** `openai/gpt-oss-20b` (map) / `openai/gpt-oss-120b` (reduce) — unchanged
- **Likert 0–1 judges:** off by default; `--likert-judges` enables legacy `scoreAllLlmJudgeMetrics`

## Splits

| Split | Purpose | Default live CLI |
|-------|---------|------------------|
| `smoke` | Fast daily gate (~1 case per runner + agentic studio) | **default** |
| `train` | Broader iteration after pipeline fixes | explicit `--split train` |
| `holdout` | Rare confirmation | explicit `--split holdout` |

Fixtures may set `split` on `EvalFixture`; otherwise [`evals/rag/splits.ts`](../../evals/rag/splits.ts) assigns defaults.

## Binary judges (per failure mode)

| Runner | Judges |
|--------|--------|
| Chat | chunk grounding; citation maps to chunk |
| Research | evidence grounding; plan sub-questions address question |
| Studio | structure valid; output grounded in chunks when present |
| LR | sections present; numeric grounding (deterministic + judge) |

Response shape: `{ "pass": boolean, "reason": string }`.

## Compare report

Load two artifact JSON directories (from `--export-artifacts`), run Flash judge with **position-bias swap** (A/B then B/A), emit `CompareReport` with win/tie rates per runner.

## Non-goals

- Production trace promotion
- GEPA / auto-prompt search on production prompts
- Full agent runs in CI (dry-run + unit tests only)
- Tuning production prompts to pass fixture metrics ([AGENTS.md](../../AGENTS.md))

## Failure taxonomy

Studio failures use `studio_structure`, `studio_grounding`, `studio_generation`. Fix suggestions prioritize retrieval/chunking/selection and studio graph/scheduling — not chat prompt files by default.
