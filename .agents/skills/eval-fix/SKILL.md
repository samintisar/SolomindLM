---
name: eval-fix
version: "1.0"
last_updated: 2026-10-17
tags: [eval, rag, workflow, fix, promotion]
description: "Fix RAG eval failures from a work order. Use after an eval run produced a work order (--output-workorder), or when asked to act on eval failures. Pipeline fixes only; prompt files are off limits by default."
---

# Eval Fix

Turn an eval work order into one pipeline fix, verified by re-runs, a train comparison and the holdout.

## When to use

- An eval run wrote a work order (`--output-workorder <wo.md>`), or you are asked to fix eval failures.
- Not for prompt-only tuning: AGENTS.md forbids tuning prompts to eval metrics.

## Steps

1. **Get the work order.** Read an existing one, or run:
   `bun run eval:rag:smoke -- --output <report.json> --output-workorder <wo.md>`
   Read its `## Rules` section before editing anything.
2. **Pick a group.** Work the groups in the order the work order lists them. Skip `## Flaky`, which is not actionable this run.
3. **Fix in the group's target files** or other pipeline files (`convex/_agents/chat/`, `convex/_services/`,
   `convex/studio/`, chunking, selection, retrieval scope, timeouts). Never edit prompt text, and never add
   fixture, notebook or rubric wording to a prompt. One exception: prompt files may change only when the
   category is `prompt_answering` AND the retrieval snapshots already contain the facts.
4. **Re-run the group's `--case` commands** until the verdicts are stable across repeats:
   `bun run eval:rag -- --case <caseId> --repeats <n> --verbose`
5. **Compare on train.** Snapshot the train split before and after the fix:
   `bun run eval:rag:train:snapshot` (before the fix), then again (after), then
   `bun run eval:compare -- <before-dir> <after-dir>`.
6. **Confirm on holdout.** Run `bun run eval:holdout -- --output <before.json>` on the pre-fix code and
   `bun run eval:holdout -- --output <after.json>` on the post-fix code, then
   `bun run eval:rag -- --promotion-check <before.json> <after.json>`. Exit 0 is required.
   Grounding or structure fails block; `expected_item_recall` does not.
7. **Open a PR** (`feature/` branch, conventional commit). Put the before and after report paths and the
   work order path in the description. Run the validation gates in AGENTS.md first.

## Stop and ask when

- The fix needs a prompt change that the rules above do not allow.
- Re-runs flip between pass and fail with no pipeline change to explain it.
- The promotion check fails after the fix.
