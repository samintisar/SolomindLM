# Eval history

One file per split: `smoke.jsonl`, `train.jsonl`, `holdout.jsonl`, or `all.jsonl` when the run had no split.
Each line is one metric row of one report:

```json
{"runId":"…","timestamp":"2026-10-17T03:17:00.000Z","commitSha":"…","split":"smoke","caseId":"agentic-patterns-20","runner":"chat","useCase":"medical-students","metric":"expected_item_recall","status":"pass","score":0.9,"configHash":"…","flaky":true}
```

- `runId` identifies one run; all rows of a report share it.
- `useCase` appears only on use-case pack rows. `flaky` appears only on rows whose repeats disagreed.
- `score` is `null` when the metric had no finite score.
- `info` rows are not stored. They never count toward a pass rate, and they are about half of all rows.
  A run with only `info` rows for a metric therefore has no row for it, so it shows no pass rate.
- The trend orders runs by timestamp. Runs with equal timestamps keep first-seen (file) order.

Rows are appended with `--append-history` on live runs (`bun run eval:rag:smoke -- --append-history`,
`bun run eval:usecases -- --append-history`). Dry runs never append. The `*.jsonl` files are git-ignored
on `main`, so local runs do not dirty the tree.

The nightly history is published by `.github/workflows/eval-nightly.yml` to the unprotected
`eval-history` branch, never to `main` (feature-branch dispatches publish nothing). Read it locally with:

```bash
bun run eval:trend -- --split smoke --branch eval-history          # merged with local rows
bun run eval:trend -- [--split smoke] [--days 14] [--check]         # local rows only
```

`--branch` fetches `origin/<branch>`, reads the split file from it, and merges it with local rows
(deduped by runId, caseId, runner and metric). A missing branch or file counts as empty and prints a note.
A malformed line is skipped with a warning when the history is loaded.
