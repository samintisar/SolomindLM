# AGENTS.md

Guidance for AI agents working in this repository. **Serena + Superpowers is the default workflow.**

## Default Workflow (Serena + Superpowers)

**Every session starts with Serena activation, then use superpowers skills for process steps.**

### 1. Serena (Primary Tooling)

Serena is the default for all code navigation, editing, and refactoring. **Prefer Serena tools over built-in Read/Edit/Write/Grep for `.ts` / `.tsx` files.**

**Session start:**

```
serena_get_current_config                    # Verify project activation
serena_activate_project project="SolomindLM" # If not activated
serena_check_onboarding_performed            # Verify onboarding
serena_list_memories                         # Review existing memories
```

**Code work:**

- `serena_get_symbols_overview` — Understand file structure first
- `serena_find_symbol` — Locate definitions by name path
- `serena_find_referencing_symbols` — Check impact before changes
- `serena_replace_symbol_body` — Replace function/class implementations
- `serena_insert_before_symbol` / `serena_insert_after_symbol` — Add code
- `serena_rename_symbol` — Rename across all references
- `serena_safe_delete_symbol` — Delete if no references

**Memory management (for continuity):**

- `serena_read_memory` — Load context from prior sessions
- `serena_write_memory` — Store new project knowledge
- `serena_edit_memory` — Update existing memories (preferred over creating new)
- `serena_list_memories` — Check what exists before writing

**Built-in tools are fallback** for: `.md`, `.json`, `.yaml`, `.css`, `.html`, or when Serena is out of sync.

### 2. Superpowers Skills (Process Steps)

**Invoke these skills at the start of the relevant phase. Do not skip.**

| Skill                                        | Trigger                                                                                                                | When to Use                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `superpowers:brainstorming`                  | Before any new feature, component, or behavior change                                                                  | Required before planning                                   |
| `superpowers:writing-plans`                  | Multi-step task, before touching code                                                                                  | Output goes in plan, not memory                            |
| `superpowers:test-driven-development`        | Deterministic logic: `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, web utilities, new queries/mutations | vitest + `convex-test`; pattern `*.test.ts` next to source |
| `superpowers:dispatching-parallel-agents`    | 2+ independent tasks, no shared state                                                                                  | Pair with subagent-driven-development                      |
| `superpowers:subagent-driven-development`    | Plan with independent tasks, current session                                                                           | Use Explore subagent for >3-query searches                 |
| `superpowers:systematic-debugging`           | Any bug, test failure, or unexpected behavior                                                                          | Before proposing fixes                                     |
| `superpowers:verification-before-completion` | Before claiming work done / committing / opening PR                                                                    | typecheck:web + typecheck:convex + lint + test:convex      |
| `superpowers:requesting-code-review`         | Before merging significant work                                                                                        | —                                                          |
| `superpowers:receiving-code-review`          | When handling review feedback                                                                                          | —                                                          |
| `superpowers:finishing-a-development-branch` | Implementation complete, deciding merge/PR/cleanup                                                                     | —                                                          |
| `superpowers:using-git-worktrees`            | Feature work needing isolation                                                                                         | Worktrees live under `.worktrees/`                         |

**Skip TDD for:** LLM prompt outputs (use RAG evals), UI surfaces (use Playwright), streaming/scheduler timing.

### 3. Domain Skills (When Triggered)

| Skill                                                                                                                                        | Trigger                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `convex-migration-helper`                                                                                                                    | Schema or table change (widen-migrate-narrow)                     |
| `convex-performance-audit`                                                                                                                   | Read amplification, OCC conflicts, `npx convex insights` warnings |
| `convex-create-component`                                                                                                                    | New isolated table-owning module                                  |
| `langchain-fundamentals`, `langchain-rag`, `langgraph-fundamentals`                                                                          | Anything under `convex/_agents/`                                  |
| `together-audio`, `together-chat-completions`, `together-embeddings`, `together-evaluations`, `together-images`, `together-video`            | Modifying `convex/_services/ai/` or `convex/studio/audio/`        |
| `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`, `vite`, `web-design-guidelines`, `webapp-testing` | Frontend work as triggers describe                                |
| `serena-usage`                                                                                                                               | Memory management, cross-file refactors, code navigation          |

---

## Hard Requirements (Non-Negotiable)

You **MUST** use the following tools. Using built-in alternatives (`Grep`, `Read`, `Edit`, `Write`, `Glob`) for code work is **incorrect** and wastes tokens.

1. **Serena (MCP)** — For every `.ts` / `.tsx` file operation (read, search, edit, refactor, rename, insert). Built-in file tools are only acceptable for `.md`, `.json`, `.yaml`, `.css`, `.html`.
2. **Superpowers (Skills)** — For every task category listed below. Invoking `Skill` is **required** before you write, edit, or debug code in those domains.

If you are unsure which skill applies, invoke `superpowers:brainstorming` first. **Do not guess.**

## Quick Start

```bash
bun install                    # Install dependencies
bun run dev                    # All dev servers (workspace)
bun run dev:web                # Web dev server on :5173 (auto-kills stale port)
bun run dev:mobile             # Expo mobile dev server
bun x convex dev               # Convex dev backend (separate terminal)
```

**Build & typecheck** (typechecks must run separately — cannot parallelize):

```bash
bun run build                  # Build all workspaces
bun run build:prod             # Production web build
bun run typecheck:convex       # Convex typecheck
bun run typecheck:web          # Web typecheck
bun run typecheck:mobile       # Expo mobile typecheck
```

**Lint & format:**

```bash
bun run lint                   # Biome (lint + format check)
bun run lint:fix               # Biome auto-fix
bun run format                 # Biome format write
bun run format:check           # Biome format check
```

**Convex env sync:**

```bash
bun run convex:env:pull:dev    # Pull Convex dev → .env.local
bun run convex:env:pull:prod   # Pull Convex prod → .env
bun run convex:env:push        # Push .env.local → Convex dev
bun run convex:env:push:prod   # Push .env → Convex prod
bun run convex:env:push:dry    # Dry run
```

**RAG eval (`bun run eval:rag`):** One-shot bootstrap: `bun run eval:rag:bootstrap-env` (reads `VITE_CONVEX_URL` from `apps/web/.env.local`, appends secrets to repo-root `.env`, runs `npx convex env set …` against dev). Template: [`evals/rag/env.eval.example`](evals/rag/env.eval.example). Push script does NOT upload `RAG_EVAL_CONVEX_URL` (CLI-only). Prefer `--case` / `--runner` for scoped runs; `eval:studio` is for cross-cutting work.

---

## Project Architecture

Bun workspaces monorepo:

- `apps/web/` — React 19.2 + Vite 7 + TS + Tailwind 4; React Router 7, Mind Elixir 5, Streamdown + KaTeX, DOMPurify, Stripe SDK
- `apps/mobile/` — Expo 55 + React Native 0.83 WebView shell (loads web routes; native auth, file upload, push notifications)
- `convex/` — Convex backend (auth, schema, functions, agents)

**Web feature layout** (`apps/web/src/features/`): `audio/`, `auth/` (incl. output language), `billing/`, `chat/` (RAG, deep research, literature review, @mentions), `landing/`, `legal/`, `notebooks/`, `onboarding/`, `sources/` (paper import, academic discovery), `studio/` (`components/views/` — ReportView, FlashcardView, QuizView, MindMapView, InfographicView, LiteratureTableView, etc.).

**Path aliases** (`tsconfig.json`): `@/*` → `./src/*`, `@convex/*` → `../../convex/*`.

**Convex modules:** `@convex-dev/auth`, `@convex-dev/stripe`, `@convex-dev/persistent-text-streaming`, `@convex-dev/action-cache`, `@convex-dev/rate-limiter`, `@convex-dev/workflow`.

**Convex schema highlights:** `notebooks`, `folders`, `documents`, `documentChunks` (1024-dim vectors, `intfloat/multilingual-e5-large-instruct`), `reports`, `audioOverviews`, `flashcards`, `mindmaps`, `quizzes`, `infographics`, `spreadsheets`, `writtenQuestions`, `conversations`, `messages`, `notes`, `researchPlans`/`researchRuns`, `literatureTables`/`literatureReports`/`literatureReviewSessions`, `studioPrompts` (+ saves/ratings), `stripeSubscriptions`, `stripePaymentHistory`, `cacheVersions`, `cacheMetrics`. See `convex/schema.ts` for the full list.

**Convex directory layout** (`_` prefix = excluded from generated API):

- `_agents/` — LangGraph agents (`chat/`, `report/`, `flashcard/`, `quiz/`, `mindmap/`, `spreadsheet/`, `written_questions/`, `audio_overview/`, `research/`, `literature_review/`); `_agents/_shared/` for LLM factory, retry, timeout, validation, sanitization
- `_lib/` — errors, limits, env helpers
- `_model/` — data models
- `_services/` — `ai/`, `search/`, `extraction/`, `processing/`, `grading/`, `cache/`
- `notebooks/`, `folders/`, `documents/`, `chat/`, `notes/`, `billing/`, `literatureReview/`, `research/`, `onboarding/`, `push/`, `userPreferences/` — domain functions
- `studio/` — content generation per type (audio, flashcards, infographic, literature_tables, mindmaps, quizzes, reports, spreadsheets, writtenQuestions)
- `storage/` — vector store, chat history
- root `auth.ts`, `schema.ts`, `http.ts` — auth config (must be at root), schema, HTTP actions

**AI services:** LLMs `openai/gpt-oss-120b` (smart) / `openai/gpt-oss-20b` (fast). Embeddings via LangChain (Together AI compatible). Reranking: ZeroEntropy. OCR: Mistral. Web search: Tavily. Content extraction: Supadata (YouTube, TikTok, Instagram, X, web). TTS / embeddings / images / video / evaluations: Together AI. Audio voices via `AUDIO_VOICE_HOST_*` env vars.

**Pipelines:**

- _Content:_ ingestion → Convex storage → extraction (Mistral OCR / Supadata transcripts) → smart per-type splitting → embed (1024-dim) → ZeroEntropy rerank
- _Generation:_ user request → mutation schedules job via `ctx.scheduler.runAfter()` (no jobs table) → LangChain agent + RAG → persistent text streaming → delivery

---

## Observability

- **Logs:** [`convex/_lib/logging/serviceLogger.ts`](convex/_lib/logging/serviceLogger.ts) emits one-JSON-per-line. Pass `requestId` so exports correlate with Convex `function.request_id`. Prefer a [Convex Log Stream](https://stack.convex.dev/log-streams-common-uses) (Axiom/Datadog) in prod — dashboard history is limited.
- **Errors:** [`convex/_lib/errors.ts`](convex/_lib/errors.ts) (`ExternalServiceError`, `StorageError`, `InputValidationError`); map to `ConvexError` via [`convex/_lib/serviceErrors.ts`](convex/_lib/serviceErrors.ts) `toConvexError`. Web parsing: [`apps/web/src/shared/utils/errorParser.ts`](apps/web/src/shared/utils/errorParser.ts) (`parseServiceError`, `parseAppError`); optional [`useServiceErrorToast`](apps/web/src/shared/hooks/useServiceErrorToast.ts).
- **HTTP retry:** [`convex/_agents/_shared/retry.ts`](convex/_agents/_shared/retry.ts) — `RetryPolicies.http`, `invokeWithHttpRetry`, `isHttpAwareRetryableError`.

---

## Environment

Bun 1.2+ required. Required env vars: `CONVEX_DEPLOYMENT` plus AI service keys (Together AI, Mistral, Tavily, Supadata, ZeroEntropy, …). Dev backend env lives in `.env.local`; prod in `.env`.

**Dev vs prod Convex URLs differ.** Local `apps/web/.env.local` uses dev URL; production hosting (Vercel) uses prod URL.

---

## Git Workflow

GitHub Flow: feature branches → PR to `main` (protected, requires PR + CI). Branch prefixes: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`. Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Squash merge.

CI on push to `main` and PRs: Convex typecheck + web build (uses repo variable `VITE_CONVEX_URL`, no second `convex deploy` — avoids racing Vercel).

## Claude Code Hooks

Auto-typecheck runs after edits in `apps/web/` (web typecheck) and `convex/` (convex typecheck). Config: `.claude/settings.json`.

Troubleshooting: Cursor agent hooks live in `.cursor/hooks.json` (use `run-hook.cmd` on Windows). Ensure `Bash(bun run typecheck:*)` is in `permissions.allow`. Restart Cursor after hook changes; check **Settings → Hooks** and the **Hooks** output channel. Disable `security-guidance` on Windows if `python3` is missing.

---

## Gotchas

- **`_` prefix excludes from API.** Functions in `convex/notebooks/index.ts` become `api.notebooks.index.*` (no `convex/domain/` module).
- **Auth file location.** `@convex-dev/auth` requires `convex/auth.ts` at root, not in a subdirectory.
- **Vite cache after API path changes:** `rm -rf apps/web/node_modules/.vite` and hard-refresh (Ctrl+Shift+R).
- **Validation gates** (in order):
  1. `bun run typecheck:web` + `typecheck:convex` — always
  2. `bun run test:convex` — vitest + `convex-test`, ~990+ tests. Run on any change in `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, or new queries/mutations
  3. `bun run test:web` — vitest for web utilities
  4. `bun run test:e2e` — Playwright for UI flows (slower; before merge)
  5. `bun run eval:rag --case=… / --runner=…` or `eval:studio` / `eval:literature-review` — agent or prompt changes (do NOT unit-test prompt outputs)
- **TS strictness:** Biome `noExplicitAny` is a warning (not error) to match `strict: false` in web tsconfig. Tighten as null safety improves.
- **Generated files excluded from lint:** `convex/_generated/` (see `biome.json` `linter.includes`).
- **React Hooks v7 ESLint-only rules** (e.g. `set-state-in-effect`) are not in Biome; use `useExhaustiveDependencies` / `useHookAtTopLevel` instead.
- **Port management:** `bun run dev:web` kills stale :5173 via `kill-port`.
- **Agent caching:** Agent results cached. Bump `cacheVersions` row when prompts change to invalidate.
- **Convex generated guidelines** — read [`convex/_generated/ai/guidelines.md`](convex/_generated/ai/guidelines.md) before any Convex code change. It overrides training-data assumptions.

## Process Skills (superpowers)

Plugin `superpowers@claude-plugins-official` is installed. **Invoke via `Skill` tool before touching code.** Project-specific triggers and overrides:

| Skill                                        | When                                                                                                                                                                                                                                                                                                         | Project notes                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `superpowers:brainstorming`                  | Before any new feature, component, or behavior change                                                                                                                                                                                                                                                        | **Required** before `EnterPlanMode`                                                                                                         |
| `superpowers:writing-plans`                  | Multi-step task, before touching code                                                                                                                                                                                                                                                                        | Output goes in plan, not memory                                                                                                             |
| `superpowers:executing-plans`                | Executing a written plan in a separate session                                                                                                                                                                                                                                                               | —                                                                                                                                           |
| `superpowers:subagent-driven-development`    | Plan with independent tasks, current session                                                                                                                                                                                                                                                                 | Pair with `dispatching-parallel-agents` for 2+ independent tasks                                                                            |
| `superpowers:dispatching-parallel-agents`    | 2+ independent tasks, no shared state                                                                                                                                                                                                                                                                        | Use `Explore` subagent for >3-query codebase searches                                                                                       |
| `superpowers:systematic-debugging`           | Any bug, test failure, or unexpected behavior, before proposing fixes                                                                                                                                                                                                                                        | —                                                                                                                                           |
| `superpowers:verification-before-completion` | Before claiming work done / committing / opening PR                                                                                                                                                                                                                                                          | Verification = `typecheck:web` + `typecheck:convex` + `lint` + `test:convex` (add `test:web` / `test:e2e` / `eval:rag` when scope warrants) |
| `superpowers:requesting-code-review`         | Before merging significant work                                                                                                                                                                                                                                                                              | —                                                                                                                                           |
| `superpowers:receiving-code-review`          | When handling review feedback                                                                                                                                                                                                                                                                                | —                                                                                                                                           |
| `superpowers:finishing-a-development-branch` | Implementation complete, deciding merge/PR/cleanup                                                                                                                                                                                                                                                           | —                                                                                                                                           |
| `superpowers:using-git-worktrees`            | Feature work needing isolation                                                                                                                                                                                                                                                                               | Worktrees live under `.worktrees/`                                                                                                          |
| `superpowers:writing-skills`                 | Creating or editing a skill                                                                                                                                                                                                                                                                                  | Edit canonical copy under `.agents/skills/<name>/SKILL.md`                                                                                  |
| `superpowers:test-driven-development`        | Deterministic logic only: `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, web utilities, new Convex queries/mutations (vitest + `convex-test`; pattern `*.test.ts` next to source). **Skip for:** LLM prompt outputs (use RAG evals), UI surfaces (use Playwright), streaming/scheduler timing. |

## Project-Specific Skill Triggers

Skill descriptions are loaded automatically; below are _project_ triggers, not generic descriptions.

**Convex** (`convex-create-component`, `convex-migration-helper`, `convex-performance-audit`, `convex-quickstart`, `convex-setup-auth`):

- Schema or table change → `convex-migration-helper` (widen-migrate-narrow)
- Read amplification, OCC conflicts, `npx convex insights` warnings → `convex-performance-audit`
- New isolated table-owning module → `convex-create-component`

**LangChain / LangGraph** (`langchain-fundamentals`, `langchain-rag`, `langgraph-fundamentals`): touching anything under `convex/_agents/`, especially RAG retrieval, graph state, or new agent types.

**Together AI** (`together-audio`, `together-chat-completions`, `together-embeddings`, `together-evaluations`, `together-images`, `together-video`): when modifying `convex/_services/ai/` or `convex/studio/audio/`.

**Frontend** (`vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`, `vite`, `web-design-guidelines`, `webapp-testing`, `bun`): **MUST invoke** when working on React components, Vite config, types, or any new UI surface.

**Serena**: see MCP section below.

## MCP Servers

- **serena** — Code navigation & symbol-aware editing for `.ts` / `.tsx`. At session start, call `initial_instructions`; `list_memories` for prior context. **MUST use** `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`, `create_text_file`. **Never use** `Grep` / `Read` / `Edit` / `Write` for code files. Built-in tools are fine for `.md`, `.json`, `.yaml`, `.css`, `.html`. If Serena seems out-of-sync after a built-in edit, call `restart_language_server`. Use the `serena-usage` skill for memory management and cross-file refactors.

## Skills Installation

Canonical skill source: `.agents/skills/<name>/SKILL.md` (in git). Claude Code reads from `.claude/skills/` (gitignored). After cloning, run **once**:

```bash
bun run link:claude-skills     # Junction (Windows) / symlink (Unix)
ls .claude/skills              # Should list 40+ skills
```

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
