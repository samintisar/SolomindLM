# AGENTS.md

Guidance for AI agents working in this repository. Claude Code also loads [`CLAUDE.md`](CLAUDE.md)
(tools, skills, hooks). Longer reference: [`docs/engineering/dev-environment.md`](docs/engineering/dev-environment.md)
(env sync, evals setup, ports, worktrees, hooks), [`docs/design/principles.md`](docs/design/principles.md)
(UI rules — read before any UI work), [`docs/adr/`](docs/adr/) (architecture decisions).

## Prompt authoring (production agents)

**Production prompts must be generalized.** Prompt text in `convex/_agents/`, `convex/studio/`, and any
user-facing generation path must work for arbitrary user-uploaded sources — any topic, length, or format.

**Strictly forbidden:**

- Tuning prompts to pass RAG eval metrics (`expected_item_recall`, `written_questions_count_match`, LLM judge scores, etc.)
- Referencing eval fixtures, golden notebooks, canonical expected-item lists, or test source filenames in prompts
- Eval-specific examples in prompt copy (benchmark datasets, named pattern lists, notebook IDs, etc.)

**When evals fail**, fix with pipeline engineering — chunking, buffer multipliers, multi-round map/recovery,
deduplication, selection logic, padding, timeouts, retrieval scope — not eval-targeted instructions.

## Commands

```bash
bun install                    # Install dependencies (also enables .githooks)
bun run dev:web                # Web dev server: :5173 in the main checkout, own port per worktree
bun run dev:mobile             # Expo mobile dev server
bun run dev:convex             # Convex dev watcher; ONE per dev deployment across worktrees (others: --once)
bun run typecheck:web          # also :convex, :evals, :e2e, :mobile — run separately, not in parallel
bun run lint                   # Biome (lint:fix to auto-fix); lint:design = shadcn design-lint ratchet
bun run test:convex            # vitest + convex-test (~1,800 tests, ~20s)
bun run test:web               # vitest for web utilities, hooks and components
bun run test:e2e               # Playwright
bun run eval:rag --case <id>   # or --runner <name>; eval:studio only for cross-cutting work
```

## Validation gates (in order)

1. `typecheck:web` + `typecheck:convex` — always; `typecheck:evals` when touching `evals/` or Convex types it imports
2. `test:convex` — any change in `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, or new queries/mutations
3. `test:web` — web utilities and hooks
4. `test:e2e` — UI flows (slower; before merge)
5. `eval:rag --case …` / `--runner …`, `eval:studio`, `eval:literature-review` — agent or prompt changes. Do NOT unit-test prompt outputs.

Pre-push runs every typecheck + Biome + design-lint. CI additionally runs Knip (blocking), Convex codegen
check, coverage, CSP smoke, and the web build.

## Architecture

Bun workspaces monorepo:

- `apps/web/` — React 19 + Vite 7 + TS + Tailwind 4; React Router 7. Features in `src/features/`
  (`audio`, `auth`, `billing`, `chat`, `landing`, `legal`, `notebooks`, `onboarding`, `sources`, `studio`).
  Aliases: `@/*` → `./src/*`, `@convex/*` → `../../convex/*`.
- `apps/mobile/` — Expo 55 + React Native WebView shell (loads web routes; native auth, file upload, push).
- `convex/` — backend. Uses `@convex-dev/auth`, `stripe`, `persistent-text-streaming`, `action-cache`,
  `rate-limiter`, `workflow`. Schema: `convex/schema.ts`.

**Convex layout:** `_agents/` (per-feature prompts, state types, routing, heuristics; `_agents/_shared/` for
LLM factory, retry, timeout, validation), `_lib/` (errors, limits, env), `_model/`, `_services/` (`ai`,
`search`, `extraction`, `processing`, `grading`, `cache`), domain folders (`notebooks/`, `documents/`,
`chat/`, `studio/`, `literatureReview/`, `research/`, …), `storage/`, root `auth.ts` / `schema.ts` / `http.ts`.

**AI services:** LLMs `deepseek-ai/DeepSeek-V4.1-Flash` (smart) / `Qwen/Qwen3.5-9B` (fast) via Together.
Embeddings OpenAI `text-embedding-3-small` (1536-dim, `_lib/embeddingConfig.ts`). Rerank Voyage `rerank-3`.
OCR Mistral. Web search Tavily. Extraction Supadata. TTS/images/video Together.

**Content pipeline:** ingestion → Convex storage → extraction (Mistral OCR / Supadata transcripts) →
per-type splitting → embed → Voyage rerank at query time. Generated results are written to the type's
table and delivered by reactive queries (chat and deep research also stream tokens).

**Agent execution** (none of these run a LangGraph graph):

- _Studio_ (reports, flashcards, quizzes, mind maps, spreadsheets, written questions, audio) — phased Convex
  actions. `studio/<type>/job.ts` registers the `internalAction`s; logic lives in `studio/<type>/*JobPhases.ts`.
  The first phase picks a mode (`_agents/_shared/studioExecutionMode.ts`): single-pass for small inputs,
  else one map-chunk action per chunk via `ctx.scheduler.runAfter(0, …)`, then a finalize phase. Every action
  must finish inside Convex's 600s limit (`studio/_job/jobDeadline.ts`); a cron (`studio/jobMutations/stuckJobs.ts`)
  fails rows whose action was killed. Audio TTS runs as up to six parallel chunk actions, then assembles.
  Infographics are one action (`studio/infographic/generate.ts`).
- _Deep research & literature review_ — `@convex-dev/workflow` durable workflows in
  `_agents/research/DeepResearchGraph.ts` and `_agents/literature_review/LiteratureReviewGraph.ts` (not
  LangGraph despite the names); they pause for user approval via workflow events.
- _Chat_ — `ChatAgent` (`_agents/chat/ChatAgent.ts`), driven and streamed by `chat/_streamChatResponse.ts`.
- _Legacy LangGraph_ — the `StateGraph` classes in `_agents/<type>/*Graph.ts` only run in tests. Change the
  `*JobPhases.ts` path, not the graph. Top-level `_agents/*Graph.ts` files are re-export barrels some phases
  still import helpers through.

## Gotchas

- **Read [`convex/_generated/ai/guidelines.md`](convex/_generated/ai/guidelines.md) before any Convex change.** It overrides training-data assumptions.
- **File path = API path; `_` does not hide a module.** `convex/notebooks/index.ts` → `api.notebooks.index.*`;
  underscore paths are registered too (`internal._agents._shared.cachedLlm.llmInternal`). Only `_generated/`
  is excluded. Keep a function private with `internalQuery`/`internalMutation`/`internalAction`.
- **New Convex module → run `npx convex codegen`.** CI fails on a stale `convex/_generated` (and Knip with it).
- **Auth file location.** `@convex-dev/auth` requires `convex/auth.ts` at root.
- **Agent caching:** results are cached; bump the `cacheVersions` row when prompts change.
- **Reranking is best-effort** (one `RERANK_TIMEOUT_MS` deadline, fall back to un-reranked order). Chat reranks
  the whole candidate pool — don't reintroduce a top-N cut. `CHAT_MIN_RELEVANCE_THRESHOLD` is tuned to Voyage's
  score scale; changing the model means bumping the cache `name` in `rerankCache.ts` and re-running the sweep.
  See [ADR 0002](docs/adr/0002-voyage-reranking-best-effort.md).
- **DeepSeek reasoning shares `max_tokens`** — too small a budget gives empty content / `finish_reason=length`.
- **Errors:** throw `ExternalServiceError` / `StorageError` / `InputValidationError` (`convex/_lib/errors.ts`),
  map with `toConvexError` (`convex/_lib/serviceErrors.ts`); parse on web with `parseServiceError`
  (`apps/web/src/shared/utils/errorParser.ts`). HTTP retry: `convex/_agents/_shared/retry.ts`.
- **Logs:** `convex/_lib/logging/serviceLogger.ts`, one JSON per line; pass `requestId`.
- **TS strictness:** Biome `noExplicitAny` is a warning (web tsconfig is `strict: false`); no new `any` in files you edit.
- **UI:** primitives in `apps/web/src/shared/components/ui` (shadcn, soft-layered look, semantic tokens, never
  `dark:`). Rules and the design-lint ratchet: [`docs/design/principles.md`](docs/design/principles.md).
- **Generated files** (`convex/_generated/`) are excluded from lint and must not be hand-edited.

## Git workflow

GitHub Flow: feature branch → PR to `main` (protected; squash merge). Branch prefixes `feature/`, `fix/`,
`refactor/`, `docs/`, `chore/`; conventional commits. One PR per issue. Write an ADR in the PR that makes a
hard-to-reverse or contested change. Code-quality cadence: [`docs/engineering/code-quality.md`](docs/engineering/code-quality.md).
