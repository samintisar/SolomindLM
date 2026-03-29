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
