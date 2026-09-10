# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** @samintisar
- **PR:** #83

## Context

The codebase carries decisions that aren't visible in the code: why generation
has no `jobs` table, why reranking sits on top of vector search, why auth config
must live at `convex/auth.ts`. `CLAUDE.md` records some as terse "Gotchas", but
without the reasoning — so they read as arbitrary rules and get questioned or
undone. Git history explains *what* changed, rarely *why this way and not the
obvious alternative*.

## Decision

We will keep Architecture Decision Records under `docs/adr/`, one Markdown file
per decision, numbered and append-only, using the format in
[`template.md`](template.md). An ADR accompanies the PR that makes an
architecturally significant change (see [`README.md`](README.md) for what
counts). Reviewers approve the decision alongside the code.

## Alternatives considered

- **Keep everything in `CLAUDE.md`** — it's already dense and agent-focused; long
  rationale bloats it and buries the operational rules. ADRs link back to it
  instead.
- **A wiki / Notion page** — drifts from the code, isn't in the PR diff, isn't
  versioned with the change that motivated it.
- **Nothing (rely on PR descriptions)** — PR descriptions aren't indexed, aren't
  discoverable by topic, and get lost once the PR is old.

## Consequences

- Significant PRs now include a short ADR; reviewers have the rationale in front
  of them.
- New contributors (and agents) have one place to learn why the system is shaped
  as it is.
- Superseded decisions stay on record with a pointer forward — the history of
  the design is legible.
- Some upfront backfill for the highest-value past decisions (listed in
  `README.md`).
