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

**Schema key tables:**
- `notebooks` - Research notebook containers
- `folders` - Organization within notebooks
- `documents` - Source files/URLs with status tracking
- `documentChunks` - Vector search chunks (1536 dimensions) for RAG
- `reports`, `audioOverviews`, `flashcards`, `quizzes` - Generated content

**Directory structure:**
- `jobs/` - Background generation jobs (10 job types: reports, flashcards, quizzes, mind maps, audio, slides, spreadsheets, written questions, doc embedding)
- `lib/` - AI agents and processing utilities
- `model/` - Data models
- `storage/` - Vector store, chat history
- `*.ts` - Functions, schema, mutations, auth config

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

- **No linting/tests configured** - Typecheck is the primary validation
- **Port management:** `bun run dev:web` automatically kills existing processes on port 5173 via kill-port script
- **Convex URLs:** Dev and prod use different deployment URLs - ensure `.env.local` uses dev URLs locally, while production hosting (Vercel) uses prod URLs
