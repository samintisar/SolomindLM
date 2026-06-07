# SolomindLM

> AI-powered research platform for multi-source content ingestion, RAG-based chat, and automated content generation.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Commercial License](https://img.shields.io/badge/Commercial%20License-Available-green.svg)](./COMMERCIAL-LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-1.2+-black?logo=bun)](https://bun.sh)
[![Convex](https://img.shields.io/badge/Convex-1.36+-brightgreen?logo=convex)](https://convex.dev)
[![React](https://img.shields.io/badge/React-19.2+-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?logo=typescript)](https://typescriptlang.org)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

SolomindLM is an open-source AI research platform that helps you ingest content from multiple sources, chat with your documents using RAG (Retrieval-Augmented Generation), and automatically generate structured content like reports, flashcards, quizzes, and more.

### Why SolomindLM?

- **All-in-one research workspace** — Collect sources, chat with them, and generate content in one place
- **Multi-source ingestion** — PDFs, images, audio, web pages, YouTube videos, social media posts
- **RAG-powered chat** — Ask questions and get answers with citations from your sources
- **Automated content generation** — Turn your research into reports, flashcards, quizzes, mind maps, infographics, and more

---

## Features

### Content Ingestion

- **Documents** — Upload PDFs, Word docs, images, and audio files
- **Paper import** — BibTeX, Zotero, Mendeley, and DOI-based bibliography import
- **Academic discovery** — Search Semantic Scholar, PubMed, and arXiv from the sources UI
- **Web scraping** — Extract content from any web page
- **Social media** — Import transcripts from YouTube, TikTok, Instagram, and X (Twitter)
- **Web search** — Search and add sources via Tavily
- **Google Drive** — Import files directly from Google Drive
- **Source guide** — AI-generated overview of ingested source material

### RAG Chat

- **Streaming conversations** — Real-time AI responses with smooth streaming
- **Citations** — Every answer includes references to source materials
- **Source @mentions** — Reference specific documents in chat prompts
- **Deep research** — Multi-step research plans with evidence gathering and synthesis
- **Literature review** — Systematic screening, ranking, and synthesis of academic papers
- **External search** — Augment responses with web, academic, and news search
- **Voice input** — Speech-to-text for chat messages

### Content Generation (Studio)

- **Reports** — Comprehensive research reports with structured sections
- **Flashcards** — Study cards with questions and answers
- **Quizzes** — Multiple-choice and open-ended questions
- **Mind maps** — Visual knowledge maps
- **Infographics** — Visual summaries generated via Together AI image models
- **Audio overviews** — Podcast-style summaries via text-to-speech
- **Spreadsheets** — Structured data tables
- **Written questions** — Short answer and essay prompts
- **Literature tables & reports** — Structured outputs from literature review workflows
- **Prompt library** — Curated, community-rated studio prompts (see [PROMPT_LIBRARY.md](PROMPT_LIBRARY.md))

### Organization

- **Notebooks** — Organize research into projects
- **Folders** — Group notebooks hierarchically
- **Notes** — Saved chat excerpts and manual notes per notebook
- **Sharing** — Collaborate via share links, members, or fork-only links
- **Onboarding** — Guided first-run experience for new users
- **Output language** — Per-user preference for generated content language
- **History** — Persistent chat history and generated content

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Web App    │  │  Mobile App  │  │   E2E Tests     │   │
│  │  (React 19)  │  │  (Expo 55)   │  │  (Playwright)   │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────────────┘   │
└─────────┼─────────────────┼──────────────────────────────────┘
          │                 │
          └────────┬────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                    Convex Backend                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Auth       │  │    API       │  │   Scheduler     │   │
│  │(Google OAuth)│  │(Queries/Actions)│  │ (Background    │   │
│  │(Password+OTP)│  │              │  │   Jobs)         │   │
│  └──────────────┘  └──────┬───────┘  └─────────────────┘   │
│                           │                                  │
│  ┌──────────────┐  ┌──────▼───────┐  ┌─────────────────┐   │
│  │   Storage    │  │   Agents     │  │   Vector DB     │   │
│  │ (Documents,  │  │ (LangGraph   │  │ (Document       │   │
│  │  Notebooks)  │  │  Pipelines)  │  │  Chunks)        │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │
          └────────┬────────┬────────┬────────┬────────┐
                   │        │        │        │        │
┌──────────────────▼──┐ ┌───▼───┐ ┌──▼───┐ ┌─▼────┐
│    Together AI      │ │Tavily │ │Mistral│ │Stripe│
│ (LLMs, Embeddings,  │ │Search │ │ OCR   │ │Billing│
│  TTS, Images)       │ │       │ │       │ │       │
└─────────────────────┘ └───────┘ └───────┘ └──────┘
┌──────────────────┐  ┌──────────┐  ┌──────────────────────┐
│   Supadata       │  │ZeroEntropy│  │      Resend          │
│ (Extraction)     │  │(Reranking)│  │    (Email OTP)       │
└──────────────────┘  └──────────┘  └──────────────────────┘
```

### Data Flow

1. **Ingestion** → Document upload → OCR/Extraction → Smart splitting → Embeddings → Vector store
2. **Chat** → User query → Vector search → Reranking → LLM with context → Streaming response
3. **Generation** → User request → Agent scheduling → LangGraph pipeline → Content generation → Streaming delivery

---

## Tech Stack

| Layer          | Technology                                                |
| -------------- | --------------------------------------------------------- |
| **Frontend**   | React 19, Vite 7, TypeScript 5.9, TailwindCSS 4, Streamdown + KaTeX |
| **Mobile**     | Expo 55, React Native 0.83 (WebView shell + native auth/push) |
| **Backend**    | Convex 1.36, TypeScript                                   |
| **AI/ML**      | LangChain, LangGraph, Together AI                         |
| **Auth**       | @convex-dev/auth (Google OAuth + Password/OTP)            |
| **Payments**   | Stripe                                                    |
| **Database**   | Convex (Document + Vector search)                         |
| **Search**     | Tavily, ZeroEntropy reranking                             |
| **OCR**        | Mistral                                                   |
| **Extraction** | Supadata                                                  |
| **Audio**      | Together AI TTS                                           |
| **Testing**    | Vitest, Playwright, convex-test                           |

---

## Prerequisites

Before you begin, ensure you have:

1. **[Bun](https://bun.sh)** v1.2.2 or higher

   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **[Node.js](https://nodejs.org)** v20.0.0 or higher (for compatibility)

3. **[Git](https://git-scm.com)**

4. **A [Convex](https://convex.dev) account** (free tier available)

5. **API keys** for the services you want to use (see [Environment Variables](#environment-variables))

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/samintisar/SolomindLM.git
cd SolomindLM
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Set Up Convex

```bash
# Initialize Convex (creates a new project)
bun x convex dev

# This will:
# - Create a Convex project
# - Start the Convex dev server
# - Generate the Convex client code
```

### 4. Configure Environment Variables

**Backend (Convex):**

```bash
# Copy the example environment file (dev uses .env.local)
cp .env.example .env.local

# Edit .env.local and add your API keys
# See Environment Variables section below for details
# Pull from Convex: bun run convex:env:pull:dev
```

**Frontend (Web):**

```bash
# Copy the web environment file
cp apps/web/.env.local.example apps/web/.env.local

# Edit apps/web/.env.local with your Convex URLs
```

**Frontend (Mobile - optional):**

```bash
# Copy the mobile environment file
cp apps/mobile/.env.local.example apps/mobile/.env.local
```

### 5. Push Environment Variables to Convex

```bash
bun run convex:env:push
```

### 6. Start the Development Servers

**Terminal 1 — Convex backend:**

```bash
bun x convex dev
```

**Terminal 2 — Web frontend:**

```bash
bun run dev:web
```

**Terminal 3 — Mobile (optional):**

```bash
bun run dev:mobile
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Environment Variables

### Required Variables

Create `.env.local` in the project root for dev (prod uses `.env`). See `.env.example` for the template. Use `bun run convex:env:pull:dev` to sync from your Convex dev deployment.

#### Convex (Required)

| Variable            | Description                 | How to Get                            |
| ------------------- | --------------------------- | ------------------------------------- |
| `CONVEX_DEPLOYMENT` | Your Convex deployment name | Created automatically by `convex dev` |
| `CONVEX_URL`        | Your Convex deployment URL  | Found in Convex dashboard             |
| `CONVEX_SITE_URL`   | Your Convex HTTP site URL   | Found in Convex dashboard             |
| `SITE_URL`          | Your production site URL    | Your domain                           |

#### Authentication (Required on Convex)

| Variable              | Description                         | How to Get                                               |
| --------------------- | ----------------------------------- | -------------------------------------------------------- |
| `AUTH_GOOGLE_ID`      | Google OAuth client ID (Convex)     | [Google Cloud Console](https://console.cloud.google.com) |
| `AUTH_GOOGLE_SECRET`  | Google OAuth client secret (Convex) | [Google Cloud Console](https://console.cloud.google.com) |
| `JWKS`                | Public JWKS JSON for session tokens | [Convex Auth](https://docs.convex.dev/auth) setup        |
| `JWT_PRIVATE_KEY`     | Private key matching `JWKS`         | [Convex Auth](https://docs.convex.dev/auth) setup        |

#### AI Services (Required for core functionality)

| Variable              | Description                   | How to Get                              |
| --------------------- | ----------------------------- | --------------------------------------- |
| `TOGETHER_AI_API_KEY` | Together AI API key           | [Together AI](https://api.together.xyz) |
| `TAVILY_API_KEY`      | Tavily search API key         | [Tavily](https://tavily.com)            |
| `MISTRAL_API_KEY`     | Mistral OCR API key           | [Mistral](https://mistral.ai)           |
| `SUPADATA_API_KEY`    | Supadata extraction API key   | [Supadata](https://supadata.ai)         |
| `ZEROENTROPY_API_KEY`     | ZeroEntropy reranking API key | [ZeroEntropy](https://zeroentropy.dev)  |
| `ZEROENTROPY_RERANK_MODEL`| Rerank model (default `zerank-2`) | ZeroEntropy dashboard              |
| `SEMANTIC_SCHOLAR_API_KEY`| Semantic Scholar (optional)   | [Semantic Scholar](https://www.semanticscholar.org/product/api) |
| `PUBMED_EMAIL`            | PubMed API contact (optional) | Your team email                           |

#### Optional Services

| Variable                      | Description            | Required For             |
| ----------------------------- | ---------------------- | ------------------------ |
| `STRIPE_SECRET_KEY`           | Stripe secret key      | Billing/subscriptions    |
| `STRIPE_WEBHOOK_SECRET`       | Stripe webhook secret  | Billing webhooks         |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe price ID        | Pro plan (monthly)       |
| `STRIPE_PRO_YEARLY_PRICE_ID`  | Stripe price ID        | Pro plan (yearly)        |
| `RESEND_API_KEY`              | Resend email API key   | Email OTP/password reset |
| `AUTH_RESEND_FROM`            | From email address     | Email sending            |
| `LANGCHAIN_API_KEY`           | LangSmith API key (local only, not pushed) | Tracing when running CLI/tools locally |
| `LANGCHAIN_PROJECT`           | LangSmith project name                     | Tracing organization                 |

#### Audio TTS (Optional on Convex)

| Variable              | Description                                      |
| --------------------- | ------------------------------------------------ |
| `AUDIO_VOICE_HOST_A`  | Together Kokoro voice ID for host A (default `af_sky`) |
| `AUDIO_VOICE_HOST_B`  | Together Kokoro voice ID for host B (default `am_echo`) |

#### RAG evaluation (dev only)

| Variable               | Where        | Description |
| ---------------------- | ------------ | ----------- |
| `RAG_EVALS_ENABLED`    | Convex dev   | Set `true` to enable eval actions |
| `RAG_EVAL_SECRET`      | Convex dev + local `.env` | Shared secret (≥16 chars); see `evals/rag/env.eval.example` |
| `RAG_EVAL_CONVEX_URL`  | Local only   | Dev deployment URL for `bun run eval:rag` (not pushed) |

Run `bun run eval:rag:bootstrap-env` once to wire dev URL + secret.

#### LLM Model Configuration

You can customize which models are used for different features. Models are hosted on Together AI (the `openai/` prefix indicates the model family, not the API provider):

```env
FAST_LLM=openai/gpt-oss-20b
SMART_LLM=openai/gpt-oss-120b
REPORT_LLM=MiniMaxAI/MiniMax-M2.7
FLASHCARDS_LLM=MiniMaxAI/MiniMax-M2.7
QUIZ_LLM=MiniMaxAI/MiniMax-M2.7
MINDMAP_LLM=MiniMaxAI/MiniMax-M2.7
SPREADSHEET_LLM=MiniMaxAI/MiniMax-M2.7
WRITTEN_QUESTIONS_LLM=MiniMaxAI/MiniMax-M2.7
AUDIO_LLM=MiniMaxAI/MiniMax-M2.7
```

### Frontend Environment Variables

Create `apps/web/.env.local` (see `apps/web/.env.local.example`):

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Optional, for billing
# Google Drive picker (optional):
# VITE_GOOGLE_CLIENT_ID=...
# VITE_GOOGLE_BROWSER_API_KEY=...
# VITE_GOOGLE_APP_ID=...
```

Sync from root after pull: `bun run convex:env:pull:dev` updates `CONVEX_URL` → `VITE_CONVEX_URL` when `apps/web/.env.local` exists.

### Mobile Environment Variables

Create `apps/mobile/.env.local` from `apps/mobile/.env.local.example`:

```env
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
EXPO_PUBLIC_WEB_URL=https://your-web-app.com
```

---

## Development

### Project Structure

```
SolomindLM/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── features/       # Domain modules
│   │   │   │   ├── auth/       # Authentication + output language
│   │   │   │   ├── audio/      # Audio playback utilities
│   │   │   │   ├── billing/    # Subscription management
│   │   │   │   ├── chat/       # RAG chat, deep research, literature review
│   │   │   │   ├── landing/    # Marketing pages
│   │   │   │   ├── legal/      # Terms, privacy
│   │   │   │   ├── notebooks/  # Notebook management
│   │   │   │   ├── onboarding/ # First-run onboarding
│   │   │   │   ├── sources/    # Content ingestion + paper import
│   │   │   │   └── studio/     # Content generation views
│   │   │   └── shared/         # UI components, hooks, utils
│   │   └── public/             # Static assets
│   └── mobile/                 # Expo WebView shell (native auth, push)
│       └── app/                # File-based routing
├── convex/                     # Convex backend
│   ├── _agents/                # LangGraph agents
│   │   ├── _shared/            # Shared agent utilities
│   │   ├── chat/               # Chat agent
│   │   ├── report/             # Report generation
│   │   ├── flashcard/          # Flashcard generation
│   │   ├── quiz/               # Quiz generation
│   │   ├── mindmap/            # Mind map generation
│   │   ├── spreadsheet/        # Spreadsheet generation
│   │   ├── written_questions/  # Written question generation
│   │   ├── audio_overview/     # Audio overview generation
│   │   ├── research/           # Deep research agent
│   │   └── literature_review/  # Literature review agent
│   ├── _lib/                   # Utilities, errors, logging
│   ├── _model/                 # Data models
│   ├── _services/              # External integrations
│   │   ├── ai/                 # AI/LLM services
│   │   ├── search/             # Search services
│   │   ├── extraction/         # Content extraction
│   │   ├── processing/         # Document processing
│   │   ├── grading/            # Content grading
│   │   └── cache/              # Caching logic
│   ├── auth.ts                 # Auth configuration (must be at root)
│   ├── chat/                   # Conversations, messages, voice
│   ├── documents/              # Ingestion, chunks, bibliography
│   ├── literatureReview/       # Literature review workflows
│   ├── notebooks/              # Notebooks, sharing, fork
│   ├── notes/                  # Saved chats + manual notes
│   ├── onboarding/             # User onboarding state
│   ├── push/                   # Mobile push tokens
│   ├── research/               # Deep research plans/runs
│   ├── schema.ts               # Database schema
│   ├── studio/                 # Generation jobs per content type
│   ├── storage/                # Vector store, chat history
│   └── userPreferences/        # Output language, etc.
├── docs/superpowers/           # Internal design specs (not user docs)
├── e2e/                        # Playwright E2E tests
├── evals/                      # RAG + studio eval suite (rag/, ragas/)
├── flowcharts/                 # LangGraph flow diagrams
└── PROMPT_LIBRARY.md           # Curated studio prompt seeds
```

### Available Scripts

**Root level:**

```bash
bun run dev              # Start all dev servers
bun run dev:web          # Start web dev server only
bun run dev:mobile       # Start mobile dev server only
bun run build            # Build all apps
bun run build:prod       # Production web build

# Type checking
bun run typecheck:web
bun run typecheck:convex
bun run typecheck:mobile

# Code quality
bun run lint
bun run lint:fix
bun run format
bun run format:check

# Testing
bun run test:convex      # Run Convex unit tests
bun run test:web         # Run web unit tests
bun run test:e2e         # Run Playwright E2E tests

# Convex env sync
bun run convex:env:pull        # Pull Convex env → local files
bun run convex:env:pull:dev    # Dev only → .env.local
bun run convex:env:pull:prod   # Prod only → .env
bun run convex:env:push        # Push .env.local → Convex dev
bun run convex:env:push:prod   # Push .env → Convex prod
bun run convex:env:push:dry    # Dry run env push

# Agent tooling
bun run link:claude-skills     # Symlink .agents/skills → .claude/skills

# E2E cleanup (Convex test data)
bun run e2e:convex:cleanup
bun run e2e:convex:cleanup-folders
bun run e2e:convex:cleanup-notebooks
```

**Web app:**

```bash
cd apps/web
bun run dev              # Start dev server
bun run build            # Build for production
bun run test             # Run unit tests
bun run test:coverage    # Run tests with coverage
```

### Adding a New Feature

1. Create a new feature directory under `apps/web/src/features/`
2. Add Convex functions under `convex/` (or `convex/_agents/` for AI features)
3. Write tests for Convex functions in `convex/` (`.test.ts` files)
4. Add E2E tests in `e2e/` if UI-facing
5. Update relevant documentation

---

## Testing

### Unit Tests

**Convex tests** (uses vitest + convex-test, ~990+ tests):

```bash
bun run test:convex
bun run test:convex:watch   # Watch mode
bun run test:integration    # Integration tests only
```

**Web tests** (uses vitest):

```bash
bun run test:web
```

### E2E Tests

```bash
# Create .env.e2e file first
cp .env.e2e.example .env.e2e
# Edit with test credentials

# Run E2E tests
bun run test:e2e

# Run with UI
bun run test:e2e:ui
```

### RAG Evaluation

```bash
# One-shot bootstrap (dev URL + secret)
bun run eval:rag:bootstrap-env

# Full eval suite
bun run eval:rag

# Scoped runs (preferred for iteration)
bun run eval:rag -- --case=chat-basic
bun run eval:rag -- --runner=report

# Studio tools (cross-cutting)
bun run eval:studio
bun run eval:literature-review

# Dry runs (no Convex calls)
bun run eval:rag:dry
bun run eval:studio:dry

# Python RAGAS metrics (requires conda env)
bun run eval:ragas
```

See `evals/rag/env.eval.example`, `evals/rag/fixtures/`, and `evals/ragas/README.md` for setup and runner details.

---

## Deployment

### Deploying to Vercel (Recommended)

1. **Connect your repo** to Vercel
2. **Set root directory** to `apps/web`
3. **Set environment variables** in Vercel dashboard:
   - `VITE_CONVEX_URL`
   - `VITE_CONVEX_SITE_URL`
   - `VITE_STRIPE_PUBLISHABLE_KEY` (optional)
4. **Add `CONVEX_DEPLOY_KEY`** for production (from Convex dashboard)

The `vercel.json` in `apps/web/` handles:

- **Production:** `convex deploy` + web build (deploys backend and frontend together)
- **Preview:** web build only (avoids overwriting prod Convex — matches CI)
- Monorepo install from repo root (`bun install --frozen-lockfile`)
- API proxy (`/api/*` → Convex HTTP actions)
- SPA fallback and security headers
- SEO prerender and sitemap generation (via web `build` script)

### Manual Deployment

```bash
# Deploy Convex functions
bun x convex deploy

# Build web app
bun run build:prod

# Deploy to your hosting platform
```

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Quick Contributing Guide

1. **Fork** the repository
2. **Create a branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Run tests** (`bun run test:convex && bun run test:web`)
5. **Commit** (`git commit -m 'feat: add amazing feature'`)
6. **Push** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Development Tips

- Follow the existing code style (enforced by [Biome](https://biomejs.dev) via `bun run lint` / `bun run format`)
- Write tests for new Convex functions
- Update documentation for new features
- Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)

---

## Troubleshooting

### Common Issues

**Build fails with "Cannot find module '@convex/...'"**

- Run `bun x convex dev` to regenerate the Convex client

**Vite cache issues**

```bash
rm -rf apps/web/node_modules/.vite
```

**Port already in use**

```bash
# The dev script automatically kills stale ports, but manually:
bun run --cwd apps/web kill-port
```

**Convex environment variables not updating**

```bash
bun run convex:env:push
```

**Type errors in generated files**

```bash
# Regenerate Convex types
bun x convex dev
```

### Getting Help

- 📖 [Convex Documentation](https://docs.convex.dev)
- 📖 [React Documentation](https://react.dev)
- 📖 [LangChain Documentation](https://js.langchain.com)
- 🐛 [Open an Issue](https://github.com/samintisar/SolomindLM/issues)

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see [LICENSE](LICENSE).

**What this means:**

- **Free for personal use** ✅
- **Free for self-hosting** ✅
- **Free for internal business use** ✅
- **Must open-source modifications** if you provide it as a network service

**Commercial License Available:**

If you want to use SolomindLM in a proprietary SaaS product without open-sourcing your code, a commercial license is available. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for details.

### Open Source vs Commercial Use

| Use Case               | License Required       |
| ---------------------- | ---------------------- |
| Personal/self-hosted   | AGPL-3.0 (free)        |
| Internal business use  | AGPL-3.0 (free)        |
| Academic/research      | AGPL-3.0 (free)        |
| Open-source SaaS       | AGPL-3.0 (free)        |
| **Proprietary SaaS**   | **Commercial License** |
| **White-label/resale** | **Commercial License** |

Contact: [samintisardev@gmail.com](mailto:samintisardev@gmail.com) for commercial licensing inquiries (see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)).

---

## Acknowledgments

- Built with [Convex](https://convex.dev) for the backend
- AI powered by [Together AI](https://together.ai) (LLMs, embeddings, TTS, infographics)
- Search powered by [Tavily](https://tavily.com)
- OCR powered by [Mistral](https://mistral.ai)
- Reranking powered by [ZeroEntropy](https://zeroentropy.dev)

---

<p align="center">Made with ❤️ by the SolomindLM team</p>
