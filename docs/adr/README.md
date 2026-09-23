# Architecture Decision Records

An ADR captures **one architecturally significant decision**: the context, the
choice, and the consequences. It answers "why is it built this way?" six months
later, when neither the code nor the git log explains it.

## When to write one

Write an ADR when a decision:

- is hard to reverse (a data model, an external service, an auth model, a
  deploy topology), or
- was contested — you rejected a plausible alternative and want the reasoning
  on record, or
- constrains future work (a convention everyone now has to follow).

Do **not** write one for routine changes, library bumps, or anything a short PR
description already covers.

## How

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` — next number,
   zero-padded to 4, kebab-case title.
2. Fill it in. Keep it to a page. Status starts `Proposed`.
3. Open it in the PR that makes the change (or just before). Reviewers approve
   the decision, not just the code.
4. On merge, set status to `Accepted`.
5. Superseding a past decision: add a new ADR, set the old one's status to
   `Superseded by NNNN`, link both ways. Never edit the record of a past
   decision — append.

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |

## Worth backfilling

Decisions already made and described in `CLAUDE.md` that deserve a proper record:

- No `jobs` table — generation is scheduled with `ctx.scheduler.runAfter()`
- Persistent text streaming for generation delivery (vs polling)
- ZeroEntropy reranking layered on the vector search
- `_`-prefix convention for API-excluded Convex modules
- Squash-only merges with 0 required approvals (single maintainer; see
  `.github/CODEOWNERS`)
