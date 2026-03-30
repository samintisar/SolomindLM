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

**Type Checking:**
Type checks must be run individually for each workspace:
- Run `bun run typecheck:convex` to check Convex backend types
- Run `bun run typecheck:web` to check web frontend types
- Type checks cannot be run simultaneously due to TypeScript compilation limitations

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

**LLMs:** Qwen3 80B (smart model), Mistral (fast model)
**Embeddings:** LangChain integration
**Reranking:** ZeroEntropy
**OCR:** Mistral for images
**Web Search:** Tavily API
**Content Extraction:** Supadata (YouTube, TikTok, Instagram, X, web scraping)
**Audio:** Eleven Labs (shimmer, echo voices)

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

## Environment Setup

**Required:** Bun 1.2+ runtime

**Convex URLs:** Dev and prod deployments have different URLs. Use dev URLs in `apps/web/.env.local` when running locally; set prod URLs in production hosting env vars (e.g., Vercel).

**Required env variables:**
- `CONVEX_DEPLOYMENT` - Convex deployment URL
- AI service keys (Qwen, Mistral, Tavily, Supadata, Eleven Labs)

## Git Workflow

**Branching:** GitHub Flow - feature branches → PR to main
- Main branch is protected (requires PR + CI checks)
- Branch prefixes: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`
- Commit format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Use squash merge for clean history

**CI:** Runs on push to `main` and PRs - Build (Web), Type Check

## Gotchas

- **Convex directory structure** - Directories with `_` prefix are excluded from API generation. Functions in `convex/domain/index.ts` become `api.domain.index.*`
- **Auth file location** - `@convex-dev/auth` requires `convex/auth.ts` at root level, not in a subdirectory
- **Vite cache** - After changing API paths, clear Vite cache: `rm -rf apps/web/node_modules/.vite` and hard refresh browser (Ctrl+Shift+R)
- **No linting/tests configured** - Typecheck is the primary validation
- **Port management:** `bun run dev:web` automatically kills existing processes on port 5173 via kill-port script
- **Convex URLs:** Dev and prod use different deployment URLs - ensure `.env.local` uses dev URLs locally, while production hosting (Vercel) uses prod URLs
- **TypeScript strict mode disabled** - `strict: false` in web tsconfig; rely on typecheck rather than strict null checks
- **Agent caching** - Agent results are cached; increment version in `cacheVersions` table when prompts change to invalidate cache

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
