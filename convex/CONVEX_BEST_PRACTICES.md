# Convex Best Practices Checklist

Based on [Convex Best Practices](https://docs.convex.dev/understanding/best-practices). Use this to audit before production.

## ✅ Doing well

- **Await all promises** – All `ctx.scheduler.runAfter` and `ctx.db.*` calls are awaited.
- **Schedule internal functions** – Jobs are scheduled with `internal.jobs.*`, not `api.*`.
- **Client → mutation → schedule action** – Content generation uses the recommended pattern: client calls an action (e.g. `scheduleQuiz`), which creates the document via mutation and schedules an internal action (`quizGeneration`). Per [Actions docs](https://docs.convex.dev/functions/actions#calling-actions-from-clients), calling an action directly from the client is an anti-pattern; we use mutations + scheduler instead.
- **Argument validators** – Public functions use `v.*` validators.
- **Access control** – Public mutations/queries use `getAuthUserId(ctx)` and ownership checks.
- **Table name in `ctx.db`** – Many calls use the table name (e.g. `ctx.db.insert("reports", {...})`). Remaining `ctx.db.get(id)` / `ctx.db.patch(id, ...)` should be migrated to the table-first form for future custom ID support ([docs](https://docs.convex.dev/understanding/best-practices#always-include-the-table-name-when-calling-ctxdb-functions)).

## ⚠️ To improve

### 1. ~~Use internal functions from Convex code (actions/crons)~~ ✅ Fixed

**Rule:** [Only schedule and `ctx.run*` internal functions](https://docs.convex.dev/understanding/best-practices#only-schedule-and-ctxrun-internal-functions). When calling `ctx.runMutation` / `ctx.runQuery` from an action, use `internal.*`, not `api.*`.

**Done:** `contentGeneration.ts` now uses `internal.reports.createInternal`, `internal.flashcards.createInternal`, `internal.quizzes.createInternal`, `internal.writtenQuestions.createInternal` with `userId` from the action’s `getAuthUserId(ctx)`. Each module (reports, flashcards, quizzes, writtenQuestions) has a `createInternal` internal mutation for use by the scheduling action.

### 2. Prefer indexes over `.filter()` on queries

**Rule:** [Avoid `.filter()` on database queries](https://docs.convex.dev/understanding/best-practices#avoid-filter-on-database-queries). Use `.withIndex()` or `.withSearchIndex()` for conditions; otherwise filter in TypeScript after a bounded `.collect()`.

**Current:** Several list/query functions use `.filter((q) => q.eq(q.field("userId"), userId))` on top of an index (e.g. `by_notebook`). For small result sets per notebook this is acceptable; for larger scale, consider compound indexes (e.g. `by_notebook_and_user`) or filtering in code after a bounded query.

### 3. Include table name in all `ctx.db` calls

**Rule:** [Always include the table name](https://docs.convex.dev/understanding/best-practices#always-include-the-table-name-when-calling-ctxdb-functions): `ctx.db.get("tableName", id)`, `ctx.db.patch("tableName", id, updates)`, etc.

**Current:** Some files still use `ctx.db.get(id)` or `ctx.db.patch(id, ...)` without the table name. Convex recommends the table-first form for future custom ID generation.

**Fix:** Search for `ctx.db.get(`, `ctx.db.patch(`, `ctx.db.replace(`, `ctx.db.delete(` and add the table name as the first argument. The [`@convex-dev/explicit-table-ids` ESLint rule](https://docs.convex.dev/eslint#explicit-table-ids) can enforce this.

### 4. Avoid sequential `ctx.runMutation` / `ctx.runQuery` in actions

**Rule:** [Avoid sequential calls](https://docs.convex.dev/understanding/best-practices#avoid-sequential-ctxrunmutation--ctxrunquery-calls-from-actions). Each call runs in a separate transaction; batch reads/writes in a single internal query/mutation when consistency is required.

**Current:** Job actions typically do one `runMutation` to create/update status and later another to save results. That’s acceptable when there are side effects (e.g. LLM calls) between them. Where you have back-to-back runMutation/runQuery with no other work, consider a single internal function that does both.

### 5. Optional: `no-floating-promises` ESLint rule

**Rule:** [Await all promises](https://docs.convex.dev/understanding/best-practices#await-all-promises). Enable the typescript-eslint rule `no-floating-promises` to catch missing `await` on Convex calls.

---

## References

- [Best Practices](https://docs.convex.dev/understanding/best-practices)
- [Actions](https://docs.convex.dev/functions/actions) (client → mutation → schedule action; use internal from Convex)
- [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) (scheduling from mutations is atomic)
- [Error Handling](https://docs.convex.dev/functions/error-handling)
