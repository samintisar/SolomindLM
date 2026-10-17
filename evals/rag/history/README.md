# Eval history

One file per split: `smoke.jsonl`, `train.jsonl`, `holdout.jsonl`, or `all.jsonl` when the run had no split.
Each line is one metric row of one report:

```json
{"runId":"…","timestamp":"2026-10-17T03:17:00.000Z","commitSha":"…","split":"smoke","caseId":"agentic-patterns-20","runner":"chat","useCase":"medical-students","metric":"expected_item_recall","status":"pass","score":0.9,"configHash":"…","flaky":true}
```

- `runId` identifies one run; all rows of a report share it.
- `useCase` appears only on use-case pack rows. `flaky` appears only on rows whose repeats disagreed.
- `score` is `null` when the metric had no finite score.

Rows are appended with `--append-history` on live runs (`bun run eval:rag:smoke -- --append-history`,
`bun run eval:usecases -- --append-history`). Local runs leave the flag off, so only the nightly
workflow (`.github/workflows/eval-nightly.yml`) writes here and commits the files back to `main`.
Dry runs never append.

Read the trend with `bun run eval:trend -- [--split smoke] [--days 14] [--check]`.
A malformed line is skipped with a warning when the history is loaded.
