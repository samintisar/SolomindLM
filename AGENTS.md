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

| Skill | Trigger | When to Use |
|---|---|---|
| `superpowers:brainstorming` | Before any new feature, component, or behavior change | Required before planning |
| `superpowers:writing-plans` | Multi-step task, before touching code | Output goes in plan, not memory |
| `superpowers:test-driven-development` | Deterministic logic: `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, web utilities, new queries/mutations | vitest + `convex-test`; pattern `*.test.ts` next to source |
| `superpowers:dispatching-parallel-agents` | 2+ independent tasks, no shared state | Pair with subagent-driven-development |
| `superpowers:subagent-driven-development` | Plan with independent tasks, current session | Use Explore subagent for >3-query searches |
| `superpowers:systematic-debugging` | Any bug, test failure, or unexpected behavior | Before proposing fixes |
| `superpowers:verification-before-completion` | Before claiming work done / committing / opening PR | typecheck:web + typecheck:convex + lint + test:convex |
| `superpowers:requesting-code-review` | Before merging significant work | — |
| `superpowers:receiving-code-review` | When handling review feedback | — |
| `superpowers:finishing-a-development-branch` | Implementation complete, deciding merge/PR/cleanup | — |
| `superpowers:using-git-worktrees` | Feature work needing isolation | Worktrees live under `.worktrees/` |

**Skip TDD for:** LLM prompt outputs (use RAG evals), UI surfaces (use Playwright), streaming/scheduler timing.

### 3. Domain Skills (When Triggered)

| Skill | Trigger |
|---|---|
| `convex-migration-helper` | Schema or table change (widen-migrate-narrow) |
| `convex-performance-audit` | Read amplification, OCC conflicts, `npx convex insights` warnings |
| `convex-create-component` | New isolated table-owning module |
| `langchain-fundamentals`, `langchain-rag`, `langgraph-fundamentals` | Anything under `convex/_agents/` |
| `together-audio`, `together-chat-completions`, `together-embeddings`, `together-evaluations`, `together-images`, `together-video` | Modifying `convex/_services/ai/` or `convex/studio/audio/` |
| `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`, `vite`, `web-design-guidelines`, `webapp-testing` | Frontend work as triggers describe |
| `serena-usage` | Memory management, cross-file refactors, code navigation |

---

## Quick Start

```bash
bun install                    # Install dependencies
bun run dev                    # All dev servers (workspace)
bun run dev:web                # Web dev server on :5173 (auto-kills stale port)
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
bun run lint                   # ESLint (flat config)
bun run lint:fix               # Auto-fix
bun run format                 # Prettier write
bun run format:check           # Prettier check
```

**Convex env push:**

```bash
bun run convex:env:push        # Push .env to convex dev
bun run convex:env:push:prod   # Push to prod
bun run convex:env:push:dry    # Dry run
```

**RAG eval (`bun run eval:rag`):** One-shot bootstrap: `bun run eval:rag:bootstrap-env` (reads `VITE_CONVEX_URL` from `apps/web/.env.local`, appends secrets to repo-root `.env`, runs `npx convex env set …` against dev). Template: [`evals/rag/env.eval.example`](evals/rag/env.eval.example). Push script does NOT upload `RAG_EVAL_CONVEX_URL` (CLI-only). Prefer `--case` / `--runner` for scoped runs; `eval:studio` is for cross-cutting work.

---

## Project Architecture

Bun workspaces monorepo:

- `apps/web/` — React 19.2 + Vite 7 + TS + Tailwind 4 + Radix; React Router 7, Mind Elixir 5, react-flip-toolkit, react-markdown + KaTeX, DOMPurify, Stripe SDK
- `apps/mobile/` — Expo + React Native
- `convex/` — Convex backend (auth, schema, functions, agents)

**Web feature layout** (`apps/web/src/features/`): `audio/`, `auth/`, `billing/`, `chat/`, `landing/`, `legal/`, `notebooks/`, `sources/`, `studio/` (with `studio/components/views/` per content type — ReportView, FlashcardView, QuizView, etc.).

**Path aliases** (`tsconfig.json`): `@/*` → `./src/*`, `@convex/*` → `../../convex/*`.

**Convex modules:** `@convex-dev/auth`, `@convex-dev/stripe`, `@convex-dev/persistent-text-streaming`, `@convex-dev/action-cache`, `@convex-dev/rate-limiter`, `@convex-dev/workpool`.

**Convex schema highlights:** `notebooks`, `folders`, `documents`, `documentChunks` (1536-dim vectors), `reports`, `audioOverviews`, `flashcards`, `quizzes`, `slides`, `spreadsheets`, `writtenQuestions`, `conversations`, `messages`, `notes`, `stripeSubscriptions`, `stripePaymentHistory`, `cacheVersions`, `cacheMetrics`.

**Convex directory layout** (`_` prefix = excluded from generated API):

- `_agents/` — LangGraph agents per type (`chat/`, `report/`, `flashcard/`, …); `_agents/_shared/` for LLM factory, retry, timeout, validation, sanitization
- `_lib/` — errors, limits, env helpers
- `_model/` — data models
- `_services/` — `ai/`, `search/`, `extraction/`, `processing/`, `grading/`, `cache/`
- `auth/`, `notebooks/`, `folders/`, `documents/`, `chat/`, `notes/`, `billing/` — domain functions
- `studio/` — content generation per type
- `storage/` — vector store, chat history
- root `*.ts` — schema, auth config, http actions

**AI services:** LLMs `openai/gpt-oss-120b` (smart) / `openai/gpt-oss-20b` (fast). Embeddings via LangChain (Together AI compatible). Reranking: ZeroEntropy. OCR: Mistral. Web search: Tavily. Content extraction: Supadata (YouTube, TikTok, Instagram, X, web). TTS / embeddings / images / video / evaluations: Together AI. Audio voices via `AUDIO_VOICE_HOST_*` env vars.

**Pipelines:**

- *Content:* ingestion → Convex storage → extraction (Mistral OCR / Supadata transcripts) → smart per-type splitting → embed (1536-dim) → ZeroEntropy rerank
- *Generation:* user request → mutation schedules job via `ctx.scheduler.runAfter()` (no jobs table) → LangChain agent + RAG → persistent text streaming → delivery

---

## Observability

- **Logs:** [`convex/_lib/logging/serviceLogger.ts`](convex/_lib/logging/serviceLogger.ts) emits one-JSON-per-line. Pass `requestId` so exports correlate with Convex `function.request_id`. Prefer a [Convex Log Stream](https://stack.convex.dev/log-streams-common-uses) (Axiom/Datadog) in prod — dashboard history is limited.
- **Errors:** [`convex/_lib/errors.ts`](convex/_lib/errors.ts) (`ExternalServiceError`, `StorageError`, `InputValidationError`); map to `ConvexError` via [`convex/_lib/serviceErrors.ts`](convex/_lib/serviceErrors.ts) `toConvexError`. Web parsing: [`apps/web/src/shared/utils/errorParser.ts`](apps/web/src/shared/utils/errorParser.ts) (`parseServiceError`, `parseAppError`); optional [`useServiceErrorToast`](apps/web/src/shared/hooks/useServiceErrorToast.ts).
- **HTTP retry:** [`convex/_agents/_shared/retry.ts`](convex/_agents/_shared/retry.ts) — `RetryPolicies.http`, `invokeWithHttpRetry`, `isHttpAwareRetryableError`.

---

## Environment

Bun 1.2+ required. Required env vars: `CONVEX_DEPLOYMENT` plus AI service keys (Together AI, OpenAI, Mistral, Tavily, Supadata, ZeroEntropy, …).

**Dev vs prod Convex URLs differ.** Local `apps/web/.env.local` uses dev URL; production hosting (Vercel) uses prod URL.

---

## Git Workflow

GitHub Flow: feature branches → PR to `main` (protected, requires PR + CI). Branch prefixes: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`. Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Squash merge.

CI on push to `main` and PRs: Convex typecheck + web build (uses repo variable `VITE_CONVEX_URL`, no second `convex deploy` — avoids racing Vercel).

## Claude Code Hooks

Auto-typecheck runs after edits in `apps/web/` (web typecheck) and `convex/` (convex typecheck). Config: `.claude/settings.json`.

Troubleshooting: ensure `Bash(bun run typecheck:*)` is in `permissions.allow`; hooks belong in `settings.json` (not `settings.local.json`); no `shell: "powershell"` (use default); restart Claude Code to reload.

---

## Gotchas

- **`_` prefix excludes from API.** Functions in `convex/domain/index.ts` become `api.domain.index.*`.
- **Auth file location.** `@convex-dev/auth` requires `convex/auth.ts` at root, not in a subdirectory.
- **Vite cache after API path changes:** `rm -rf apps/web/node_modules/.vite` and hard-refresh (Ctrl+Shift+R).
- **Validation gates** (in order):
  1. `bun run typecheck:web` + `typecheck:convex` — always
  2. `bun run test:convex` — vitest + `convex-test`, ~277 tests, <1s. Run on any change in `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, or new queries/mutations
  3. `bun run test:web` — vitest for web utilities
  4. `bun run test:e2e` — Playwright for UI flows (slower; before merge)
  5. `bun run eval:rag --case=… / --runner=…` — agent or prompt changes (do NOT unit-test prompt outputs)
- **TS strictness:** `@typescript-eslint/no-explicit-any` is a warning (not error) to match `strict: false` in web tsconfig. Tighten as null safety improves.
- **Generated files excluded from lint:** `convex/_generated/`.
- **Port management:** `bun run dev:web` kills stale :5173 via `kill-port`.
- **Agent caching:** Agent results cached. Bump `cacheVersions` row when prompts change to invalidate.
- **Convex generated guidelines** — read [`convex/_generated/ai/guidelines.md`](convex/_generated/ai/guidelines.md) before any Convex code change. It overrides training-data assumptions.

## Process Skills (superpowers)

Plugin `superpowers@claude-plugins-official` is installed. Invoke via `Skill` tool. Project-specific triggers and overrides:

| Skill | When | Project notes |

|---|---|---|
| `superpowers:brainstorming` | Before any new feature, component, or behavior change | Required before `EnterPlanMode` |
| `superpowers:writing-plans` | Multi-step task, before touching code | Output goes in plan, not memory |
| `superpowers:executing-plans` | Executing a written plan in a separate session | — |
| `superpowers:subagent-driven-development` | Plan with independent tasks, current session | Pair with `dispatching-parallel-agents` for 2+ independent tasks |
| `superpowers:dispatching-parallel-agents` | 2+ independent tasks, no shared state | Prefer `Explore` subagent for >3-query codebase searches |
| `superpowers:systematic-debugging` | Any bug, test failure, or unexpected behavior, before proposing fixes | — |
| `superpowers:verification-before-completion` | Before claiming work done / committing / opening PR | Verification = `typecheck:web` + `typecheck:convex` + `lint` + `test:convex` (add `test:web` / `test:e2e` / `eval:rag` when scope warrants) |
| `superpowers:requesting-code-review` | Before merging significant work | — |
| `superpowers:receiving-code-review` | When handling review feedback | — |
| `superpowers:finishing-a-development-branch` | Implementation complete, deciding merge/PR/cleanup | — |
| `superpowers:using-git-worktrees` | Feature work needing isolation | Worktrees live under `.worktrees/` |
| `superpowers:writing-skills` | Creating or editing a skill | Edit canonical copy under `.agents/skills/<name>/SKILL.md` |
| `superpowers:test-driven-development` | Deterministic logic only: `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, web utilities, new Convex queries/mutations (vitest + `convex-test`; pattern `*.test.ts` next to source). **Skip for:** LLM prompt outputs (use RAG evals), UI surfaces (use Playwright), streaming/scheduler timing. |

## Project-Specific Skill Triggers

Skill descriptions are loaded automatically; below are *project* triggers, not generic descriptions.

**Convex** (`convex-create-component`, `convex-migration-helper`, `convex-performance-audit`, `convex-quickstart`, `convex-setup-auth`):

- Schema or table change → `convex-migration-helper` (widen-migrate-narrow)
- Read amplification, OCC conflicts, `npx convex insights` warnings → `convex-performance-audit`
- New isolated table-owning module → `convex-create-component`

**LangChain / LangGraph** (`langchain-fundamentals`, `langchain-rag`, `langgraph-fundamentals`): touching anything under `convex/_agents/`, especially RAG retrieval, graph state, or new agent types.

**Together AI** (`together-audio`, `together-chat-completions`, `together-embeddings`, `together-evaluations`, `together-images`, `together-video`): when modifying `convex/_services/ai/` or `convex/studio/audio/`.

**Frontend** (`vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`, `vite`, `web-design-guidelines`, `webapp-testing`, `bun`): use as triggers describe; `web-design-guidelines` for any new UI surface.

**Serena**: see MCP section below.

## MCP Servers

- **serena** — Code navigation & symbol-aware editing for `.ts` / `.tsx`. At session start, call `initial_instructions`; `list_memories` for prior context. Prefer `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`, `create_text_file` over `Grep` / `Read` / `Edit` / `Write` for code files. Built-in tools are fine for `.md`, `.json`, `.yaml`, `.css`, `.html`. If Serena seems out-of-sync after a built-in edit, call `restart_language_server`. Use the `serena-usage` skill for memory management and cross-file refactors.

## Skills Installation

Canonical skill source: `.agents/skills/<name>/SKILL.md` (in git). Claude Code reads from `.claude/skills/` (gitignored). After cloning, run **once**:

```bash
bun run link:claude-skills     # Junction (Windows) / symlink (Unix)
ls .claude/skills              # Should list 40+ skills
```
