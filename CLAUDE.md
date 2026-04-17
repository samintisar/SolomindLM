# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

**Development:**

```bash
bun install                    # Install all dependencies
bun run dev                    # Run all dev servers (workspace)
bun run dev:web                # Run only web dev server on :5173
bun x convex dev               # Run Convex dev backend (separate terminal)
```

**Building & Type Checking:**

```bash
bun run build                  # Build all workspace packages
bun run build:prod             # Build production web app
bun run typecheck:convex       # Type check convex only
bun run typecheck:web          # Type check web only
```

Type checks must be run individually per workspace (cannot run simultaneously).

**Linting & Formatting:**

```bash
bun run lint                  # Run ESLint on entire codebase
bun run lint:fix              # Auto-fix ESLint issues
bun run format                # Format all files with Prettier
bun run format:check          # Check formatting without writing
```

**Convex Environment:**

```bash
bun run convex:env:push        # Push .env vars to convex dev
bun run convex:env:push:prod   # Push to production convex
bun run convex:env:push:dry    # Dry run for env push
```

## Project Architecture

**Monorepo structure using Bun workspaces:**

- `apps/web/` - React 19.2 + Vite frontend
- `convex/` - Convex backend (auth, database, functions, agents)

### Frontend (`apps/web/`)

**Stack:** React 19.2, Vite 7.x, TypeScript, TailwindCSS 4.x, Radix UI (lucide-react icons)

**Key libraries:**

- React Router DOM 7.x for routing
- Mind Elixir 5.x for mind maps
- React Flip Toolkit for flashcards
- React Markdown + KaTeX for math rendering
- DOMPurify for sanitizing HTML
- Stripe SDK for payments

**Feature organization:**

- `features/audio/` - Audio overview generation
- `features/auth/` - Authentication with @convex-dev/auth
- `features/billing/` - Stripe subscription management
- `features/chat/` - RAG chat with citations & streaming
- `features/landing/` - Landing page
- `features/legal/` - Legal pages (terms, privacy)
- `features/notebooks/` - Notebook management
- `features/sources/` - Source discovery and management
- `features/studio/` - AI generation tools (reports, flashcards, quizzes, mind maps, audio, slides, spreadsheets)
- `features/studio/components/views/` - View components for each content type (ReportView, FlashcardView, QuizView, etc.)

**Path aliases (tsconfig.json):**

- `@/*` → `./src/*`
- `@convex/*` → `../../convex/*`

### Backend (`convex/`)

**Convex modules enabled:**

- `@convex-dev/auth` - Authentication (OTT handler)
- `@convex-dev/stripe` - Stripe integration
- `@convex-dev/persistent-text-streaming` - Streaming responses
- `@convex-dev/action-cache` - Action caching
- `@convex-dev/rate-limiter` - Rate limiting
- `@convex-dev/workpool` - Background job scheduling

**Schema key tables:**

- `notebooks` - Research notebook containers
- `folders` - Organization within notebooks
- `documents` - Source files/URLs with status tracking
- `documentChunks` - Vector search chunks (1536 dimensions) for RAG
- `reports`, `audioOverviews`, `flashcards`, `quizzes` - Generated content
- `slides`, `spreadsheets`, `writtenQuestions` - Additional generated content
- `conversations`, `messages` - Chat history with RAG citations
- `notes` - Saved chat conversations and manual user notes
- `stripeSubscriptions`, `stripePaymentHistory` - Billing state
- `cacheVersions`, `cacheMetrics` - Agent cache invalidation tracking

**Directory structure:**

- `_agents/` - LangGraph-based agents (underscore = excluded from API). Subdirs per type: `chat/`, `report/`, `flashcard/`, etc.
- `_agents/_shared/` - Shared utilities: LLM factory, retry, timeout, validation, sanitization
- `_lib/` - Core utilities (errors, limits, env helpers)
- `_model/` - Data models (underscore = excluded from API)
- `_services/` - External service integrations: `ai/`, `search/`, `extraction/`, `processing/`, `grading/`, `cache/`
- `auth/`, `notebooks/`, `folders/`, `documents/`, `chat/`, `notes/`, `billing/` - Domain function directories
- `studio/` - Content generation: `reports/`, `flashcards/`, `quizzes/`, `mindmaps/`, `audio/`, `slides/`, `spreadsheets/`, `writtenQuestions/`
- `storage/` - Vector store, chat history
- `*.ts` - Functions, schema, mutations, auth config (root level)

### AI Services Integration

**LLMs:** openai/gpt-oss-120b (smart model), openai/gpt-oss-20b (fast model)
**Embeddings:** LangChain integration (can use Together AI models)
**Reranking:** ZeroEntropy
**OCR:** Mistral for images
**Web Search:** Tavily API
**Content Extraction:** Supadata (YouTube, TikTok, Instagram, X, web scraping)
**Together AI:** Audio overviews (TTS), embeddings, chat completions, images, video, evaluations
**Audio voices:** Configured via `AUDIO_VOICE_HOST_*` environment variables

### Processing Pipelines

**Content Processing:**

1. Ingestion → Convex storage
2. Extraction (OCR via Mistral, transcripts via Supadata)
3. Splitting with smart strategies per content type
4. Embedding and vector storage (1536 dimensions)
5. Reranking with ZeroEntropy

**Generation Pipeline:**

1. User request → Convex job queue
2. LangChain agent processes with RAG
3. Streaming via persistent text streaming
4. Content delivery when complete

**Note:** Jobs are scheduled directly via `ctx.scheduler.runAfter()` from mutations, not via a jobs table.

### Observability (logging and errors)

- **Service logs:** [`convex/_lib/logging/serviceLogger.ts`](convex/_lib/logging/serviceLogger.ts) emits one JSON object per line (dashboard + optional Log Streams). Pass `requestId` in context when you have it so exports can correlate with Convex `function.request_id`.
- **Production logs:** Prefer a [Convex Log Stream](https://stack.convex.dev/log-streams-common-uses) (e.g. Axiom, Datadog); dashboard log history is limited.
- **Structured errors:** [`convex/_lib/errors.ts`](convex/_lib/errors.ts) (`ExternalServiceError`, `StorageError`, `InputValidationError`); map to `ConvexError` for clients via [`convex/_lib/serviceErrors.ts`](convex/_lib/serviceErrors.ts) `toConvexError`. Web parsing: [`apps/web/src/shared/utils/errorParser.ts`](apps/web/src/shared/utils/errorParser.ts) (`parseServiceError`, `parseAppError`) and optional [`useServiceErrorToast`](apps/web/src/shared/hooks/useServiceErrorToast.ts).
- **HTTP retry:** [`convex/_agents/_shared/retry.ts`](convex/_agents/_shared/retry.ts) — `RetryPolicies.http`, `invokeWithHttpRetry`, `isHttpAwareRetryableError`.

## Environment Setup

**Required:** Bun 1.2+ runtime

**Convex URLs:** Dev and prod deployments have different URLs. Use dev URLs in `apps/web/.env.local` when running locally; set prod URLs in production hosting env vars (e.g., Vercel).

**Required env variables:**

- `CONVEX_DEPLOYMENT` - Convex deployment URL
- AI service keys (Together AI, OpenAI for embeddings/slides, Mistral, Tavily, Supadata, ZeroEntropy, etc.)

## Git Workflow

**Branching:** GitHub Flow - feature branches → PR to main

- Main branch is protected (requires PR + CI checks)
- Branch prefixes: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`
- Commit format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Use squash merge for clean history

**CI:** Runs on push to `main` and PRs — Convex typecheck; web build (main uses repo variable `VITE_CONVEX_URL`, not a second `convex deploy` — avoids racing Vercel).

## Claude Code Hooks

**Automatic typechecking is enabled:**

- **Web files**: Typecheck runs automatically after editing any file in `apps/web/`
- **Convex files**: Typecheck runs automatically after editing any file in `convex/`

**Hook configuration:** `.claude/settings.json`

**If hooks fail to run:**

1. Check that `Bash(bun run typecheck:*)` is in permissions.allow
2. Ensure hooks are in `settings.json` (not `settings.local.json`)
3. Remove `shell: "powershell"` parameter (use default shell)
4. Restart Claude Code to reload configuration

## Gotchas

- **Convex directory structure** - Directories with `_` prefix are excluded from API generation. Functions in `convex/domain/index.ts` become `api.domain.index.*`
- **Auth file location** - `@convex-dev/auth` requires `convex/auth.ts` at root level, not in a subdirectory
- **Vite cache** - After changing API paths, clear Vite cache: `rm -rf apps/web/node_modules/.vite` and hard refresh browser (Ctrl+Shift+R)
- **Linting/formatting:** ESLint (flat config) + Prettier. Run `bun run lint` before committing. Convex generated files (`convex/_generated/`) are excluded. `@typescript-eslint/no-explicit-any` is a warning (not error) to match `strict: false` in web tsconfig — tighten this as null safety improves. No tests configured yet — typecheck is the primary validation.
- **Port management:** `bun run dev:web` automatically kills existing processes on port 5173 via kill-port script
- **Convex URLs:** Dev and prod use different deployment URLs - ensure `.env.local` uses dev URLs locally, while production hosting (Vercel) uses prod URLs
- **TypeScript strict mode disabled** - `strict: false` in web tsconfig; rely on typecheck rather than strict null checks
- **Agent caching** - Agent results are cached; increment version in `cacheVersions` table when prompts change to invalidate cache

## Required Skills

**Canonical location:** `.agents/skills/<skill-name>/SKILL.md` (single copy in git). Add or edit skills only there. Cursor and other agents should use that path.

**Claude Code** expects skills under `.claude/skills/`, but `.claude/` is gitignored. After cloning, run `bun run link:claude-skills` once to create a junction (Windows) or symlink (macOS/Linux) from `.claude/skills` to `.agents/skills`.

**Always invoke these skills at the specified triggers.**

### Core Skills (Session Workflow)

| Skill              | When                                       |
| ------------------ | ------------------------------------------ |
| `serena-first`     | Session start — before any code work       |
| `coding-standards` | Writing or reviewing TypeScript/React code |

### Convex Skills

| Skill                      | When                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `ai-agent-design`          | Designing or implementing LangGraph + Convex agents             |
| `convex-create-component`  | Creating new Convex components with isolated tables             |
| `convex-migration-helper`  | Planning or executing schema/data migrations                    |
| `convex-performance-audit` | Auditing or optimizing Convex performance                       |
| `convex-quickstart`        | Initializing new Convex projects                                |
| `convex-setup-auth`        | Setting up authentication with @convex-dev/auth                 |
| `langgraph-langchain`      | Modifying agents in `convex/_agents/` or working with LangGraph |
| `langsmith`                | Setting up tracing/observability for agents                     |

### Frontend & AI Generation Skills

| Skill                | When                                                       |
| -------------------- | ---------------------------------------------------------- |
| `add-studio-feature` | Adding or extending Studio generation tools                |
| `bun-runtime`        | Working with Bun-specific features or debugging Bun issues |

### Together AI Skills

| Skill                       | When                                       |
| --------------------------- | ------------------------------------------ |
| `together-audio`            | Working with TTS/STT or audio overviews    |
| `together-chat-completions` | Using Together AI's chat/completions API   |
| `together-embeddings`       | Working with embeddings or vector search   |
| `together-evaluations`      | Using LLM-as-a-judge evaluation            |
| `together-images`           | Text-to-image generation or editing        |
| `together-video`            | Text-to-video or image-to-video generation |

## MCP Servers

### context7 - Documentation Lookup

This project uses the **context7 MCP server** for live documentation lookup of libraries and frameworks.

**When to use context7:**

- Looking up API documentation for any library (React, LangChain, Convex, Stripe, etc.)
- Finding code examples for specific library features
- Checking current best practices and patterns
- Understanding library-specific APIs that may have changed

**How to use:**

```
"Show me React 19.2 documentation for useTransition"
"What's the current LangChain API for creating agents?"
"How do I use Convex's v.scalar() for schema definitions?"
```

**Available via:** `mcp__plugin_context7_context7__query-docs` tool

**Install:** Already configured in `.mcp.json`

## Code Navigation & Editing (Serena MCP)

**ALWAYS invoke the `serena-first` skill at the start of every session before doing any code work.** This project uses the Serena MCP server for LSP-powered semantic code operations.

### Session Startup

1. Call `initial_instructions` to load Serena's operational guidance for this project
2. Check `list_memories` for any relevant project context from prior sessions
3. Proceed with code work using Serena's tools as the primary method

### General Rules

- Prefer Serena's code-aware tools over naive file reads and regex/grep:
  - Use `find_symbol` and `find_referencing_symbols` to locate definitions/usages instead of scanning whole files.
  - Use `insert_before_symbol`, `insert_after_symbol`, and `replace_symbol_body` for edits instead of rewriting entire files.
- For non-trivial refactors: ask Serena to find all references before changing any public API. Apply edits via Serena's editing tools so changes are localized and consistent.

### When to Use Serena vs Built-in Tools

**Use Serena for (`.ts`/`.tsx` files):**

- **Reading code:** `find_symbol` (with `include_body=true`) or `get_symbols_overview` to understand structure, then `find_symbol` to read specific symbols — avoids loading entire files
- **Searching:** `find_symbol` or `search_for_pattern` instead of `Grep` for code searches
- **Editing:** `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol` instead of `Edit` — more token-efficient and localized
- **Renaming:** `rename_symbol` for project-wide renames
- **Finding usages:** `find_referencing_symbols` before changing any signature
- **New code files:** `create_text_file` instead of `Write`

**Built-in tools are fine for:** non-code files (`.md`, `.json`, `.yaml`, `.css`, `.html`), images, and binary files.

### Workflow

1. Start with `get_symbols_overview` to understand a file's structure
2. Use `find_symbol` to read only the symbols you need (`include_body=true`)
3. Edit with `replace_symbol_body` or insert with `insert_before_symbol`/`insert_after_symbol`
4. Verify references with `find_referencing_symbols` after changing public APIs

### Operational Preferences

- Assume Serena is already configured for this project; don't try to reconfigure the MCP server.
- If Serena tools fail or are unavailable, fall back to Claude Code's built-in file operations, but prefer Serena when possible.
- **LSP staleness:** If Serena seems unaware of recent changes, call `restart_language_server` to resync. This can happen after using built-in tools for edits.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
