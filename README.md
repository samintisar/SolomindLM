# SolomindLM

AI-powered research platform for multi-source content ingestion, RAG-based chat, and automated content generation.

## Features

- **Content Ingestion** — Upload PDFs, documents, images, and audio; scrape web pages; import YouTube, TikTok, Instagram, and X transcripts; search and add sources via Tavily
- **RAG Chat** — Streaming chat with citation support across all ingested sources
- **Content Generation** — Reports, flashcards, quizzes, mind maps, audio overviews, slide decks, and spreadsheets
- **Notebooks** — Organize research into notebooks with sources, chat history, and generated content

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS 4, Radix UI |
| Backend | Convex 1.31+, TypeScript, LangChain |
| Auth | @convex-dev/auth |
| LLMs | Qwen3 80B, Mistral |
| Embeddings | OpenAI (text-embedding-3-small) |
| Reranking | ZeroEntropy (zerank-2) |
| OCR | Mistral |
| Web Search | Tavily |
| Content Extraction | Supadata |
| Audio | Eleven Labs |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.2+
- A [Convex](https://convex.dev) account

### Installation

```bash
bun install
```

### Configuration

**Convex backend** — copy `.env.example` to `.env` and fill in:

```env
CONVEX_DEPLOYMENT=<your-convex-deployment-url>
# AI service keys: Qwen, Mistral, Tavily, Supadata, Eleven Labs, ZeroEntropy
```

**Web frontend** — copy `apps/web/.env.example` to `apps/web/.env.local` and fill in:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

> For production, set the prod Convex URL in your hosting environment (e.g., Vercel env vars). Dev and prod deployments use different URLs.

### Deploying to Vercel

**Project settings**

- Connect the GitHub repo and set **Root Directory** to `apps/web` (monorepo). Vercel reads `apps/web/vercel.json` from that root.
- Use the same **Bun** major version as `package.json` (`packageManager`: `bun@1.2.x`).

**Build behavior**

- **Production** (`main` / production branch): runs `convex deploy` then the web build, so backend and frontend stay aligned. Requires a Convex deploy key on Vercel.
- **Preview** (pull requests / other branches): runs **only** `bun run build:prod` — it does **not** push Convex code, so previews cannot overwrite production Convex. Point Preview env vars at a **dev** Convex deployment.

**Environment variables**

Use **`VITE_CONVEX_SITE_URL`** as the single value for both the browser (Vite) and the Vercel edge `/api/*` proxy. Per [Vercel routing docs](https://vercel.com/docs/project-configuration/vercel-json), only `routes[].dest` supports `${VAR}` expansion with an `env` allowlist — so the proxy reuses the same name as your client env.

Set it to your Convex **HTTP** site base: `https://YOUR_DEPLOYMENT.convex.site` (no trailing slash).

| Name | Production | Preview |
|------|------------|---------|
| `CONVEX_DEPLOY_KEY` | Required on Vercel ([deploy key](https://docs.convex.dev/cli/deploy-key-types)) | Omit |
| `VITE_CONVEX_SITE_URL` | Required — same URL for chat/streaming **and** `/api/*` proxy | Required — dev `.convex.site` |
| `VITE_CONVEX_URL` | Set automatically during Production build by `convex deploy --cmd` | Required — dev `https://….convex.cloud` |

If you previously used **`CONVEX_SITE_ORIGIN`**, delete it in Vercel and set **`VITE_CONVEX_SITE_URL`** to the same value (one variable instead of two).

**Routing:** `vercel.json` uses a single **`routes`** array: `filesystem` (static assets from `dist`) → `/api/*` proxied with `${VITE_CONVEX_SITE_URL}` ([env in `dest`](https://vercel.com/docs/project-configuration/vercel-json)) → catch‑all to `/index.html` for the SPA. No separate `rewrites` block.

**CLI (optional)**

```bash
npm i -g vercel
vercel login
cd apps/web
vercel link
vercel env pull .env.local
vercel deploy
vercel deploy --prod
```

**CI vs Vercel**

On **`main`**, GitHub Actions runs the same command as Vercel Production: `convex deploy` with `--cmd "bun run build:prod"`. Add repository secret **`CONVEX_DEPLOY_KEY`** (same key as Vercel). Pull requests still run typecheck + a standalone Vite build with a placeholder Convex URL (no deploy).

### Running Locally

```bash
# Terminal 1 — Convex backend
bun x convex dev

# Terminal 2 — Web frontend
bun run dev:web
```

Open [http://localhost:5173](http://localhost:5173).

## Project Structure

```
SolomindLM/
├── apps/web/          # React frontend
│   └── src/
│       └── features/  # auth, chat, notebooks, sources, studio, billing
└── convex/            # Convex backend
    ├── _agents/       # LangGraph agents (chat, report, flashcard, etc.)
    ├── _services/     # External service integrations
    ├── studio/        # Content generation modules
    └── *.ts           # Schema, functions, auth config
```

## License

Private — all rights reserved.
