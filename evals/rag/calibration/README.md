# Judge calibration labels

Human labels on LLM-judge verdicts, committed so agreement accumulates across sessions. Before this
directory existed, labels lived in the gitignored `evals/rag/generated/judge-queue.json` and were lost.

## Files

One JSONL file per judge family. The family is the metric name; `:` becomes `__` in the file name.

| Metric | File |
| --- | --- |
| `binary_judge_chat_grounding` | `binary_judge_chat_grounding.jsonl` |
| `binary_judge_studio_structure` | `binary_judge_studio_structure.jsonl` |
| `rubric:<pack>:<check>` | `rubric__<pack>__<check>.jsonl` |

Each line is one labelled verdict:

```json
{"caseId":"agentic-patterns-20","runner":"chat","metric":"binary_judge_chat_grounding","modelStatus":"fail","score":0,"modelReason":"…","humanAgree":true,"labeledAt":"2026-10-17T10:00:00.000Z","commitSha":"d3d48e8…","labelKey":"…"}
```

- `humanAgree: true` means you agree with the model verdict; `false` means you disagree.
- `labelKey` is `sha1(caseId|runner|metric|modelReason)`. A verdict already in the store is never
  added again, and the first label for a key wins. Do not edit rows in place; to change a label,
  delete the row and re-append. A new label that disagrees with a stored one is not written; the
  append reports it as a conflict ("N labels conflict with the store").
- `commitSha` is the commit the eval ran at, when known.

## How to label

1. Run the eval. It writes `evals/rag/generated/judge-queue.json` (up to 20 verdicts, fails and
   passes interleaved).
2. For each item, read the answer against the evidence and set `humanAgree` to `true` or `false`
   (leave `null` to skip it).
3. Score the queue together with the store:

   ```bash
   bun run eval:rag:dry -- --score-judge-queue evals/rag/generated/judge-queue.json
   ```

   This prints a per-judge table (labelled count, agreement, Cohen's kappa, ready or not) and a JSON
   summary. Exit codes: `0` every promoting judge family is ready, `1` not ready, `2` fewer than 20
   labels in total (or the file is not a queue).

## How to append

```bash
bun run eval:rag:dry -- --score-judge-queue evals/rag/generated/judge-queue.json --append-calibration
```

Appends only the labelled rows of the queue, skipping any already stored, then scores the store plus
the queue. Commit the resulting `*.jsonl` changes.

## What counts as ready

For each judge family, `blockingReady` needs all three:

- at least 20 labelled rows,
- agreement (share of rows where `humanAgree` is true) at least 0.8,
- Cohen's kappa at least 0.6, on the 2x2 of model verdict against human verdict.

Kappa is 0 when every model verdict is the same class: agreement on one class does not show the
judge can tell pass from fail. A family needs both passes and fails labelled to block.

`readyForPromptCompile` is true when every promoting family (the prefixes in
`evals/rag/reports/promotion.ts`: chat/research/studio grounding, studio structure, literature review)
has labels and each one is blocking-ready. Rubric and citation families are reported but do not
affect readiness.

## Calibration is reported, not enforced

Holdout promotion (`--promotion-check`) does not read these labels. A judge family with weak
calibration still blocks promotion as before. Calibration tells you which judges to trust; making
promotion depend on it is a separate decision, to take once the per-judge numbers are stable.
