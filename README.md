# SolomindLM

AI-powered research platform with multi-source content ingestion, RAG-based chat, and automated content generation.

## Features

### Content Ingestion
- **Multi-format uploads**: PDF, TXT, MD, DOCX, Images, Audio files
- **Web scraping**: Extract content from any URL
- **Social media transcripts**: YouTube, TikTok, Instagram, X (Twitter)
- **Web discovery**: Search and add sources using Tavily API
- **Text input**: Direct text paste support

### AI Tools
- **Chat**: RAG-powered chat with citation support
- **Reports**: Generate reports in multiple formats:
  - Briefing Document, Study Guide, Blog Post, Summary
  - Technical Report, Concept Explainer, Methodology Overview, Custom
- **Flashcards**: AI-generated study cards with configurable difficulty
- **Quizzes**: Interactive multiple-choice quizzes with hints and scoring
- **Mind Maps**: Visual knowledge graphs using Mind Elixir
- **Audio**: Audio content generation

### Organization
- **Notebooks**: Create and organize research with custom icons and colors
- **Sources Panel**: Track and manage all your sources
- **Status Tracking**: Real-time updates for background generation jobs

## Tech Stack

### Frontend
- React 19, Vite, TypeScript
- TailwindCSS, Radix UI components
- Mind Elixir (mind maps), React Flip Toolkit (flashcards)

### Backend
- Convex (backend, auth, storage, real-time)
- Bun runtime, TypeScript, LangChain

### AI Services
- **Cohere**: Embeddings, text generation
- **Together AI**: LLM (Llama 3.2 3B), title generation
- **Mistral**: OCR for images
- **Tavily**: Web source discovery
- **Supadata**: Content extraction (YouTube, TikTok, Instagram, X, web scraping)

## Project Structure

```
SolomindLM/
├── apps/
│   ├── web/                    # React frontend
│   │   └── src/
│   │       ├── features/
│   │       │   ├── chat/       # Chat interface with citations
│   │       │   ├── notebooks/  # Notebook management
│   │       │   ├── sources/    # Source discovery and management
│   │       │   └── studio/     # AI generation tools (reports, flashcards, quizzes, mind maps)
│   │       └── shared/
│   │           └── types/      # Shared TypeScript types
├── convex/                     # Convex backend
│   ├── jobs/                   # Generation jobs (reports, flashcards, quizzes, etc.)
│   ├── storage/                # Vector store, chat history
│   └── *.ts                    # Functions, auth, schema
├── lib/                        # Shared agents & utilities (used by Convex)
├── bun.lock
└── package.json                # Workspace configuration
```

## Setup

### Prerequisites
- **Bun** v1.0+ (install: `curl -fsSL https://bun.sh/install | bash`)

### 1. Install dependencies
```bash
bun install
```

### 2. Configure environment

- **Convex**: Copy `.env.example` to `.env` in the project root and set Convex + AI keys (see Convex dashboard and docs).
- **Web**: Copy `apps/web/.env.example` to `apps/web/.env` and set:
  - `VITE_CONVEX_URL` – your Convex deployment URL (e.g. `https://your-deployment.convex.cloud`)
  - `VITE_CONVEX_SITE_URL` – Convex site URL for HTTP actions (e.g. `https://your-deployment.convex.site`), or omit and it will be derived from `VITE_CONVEX_URL`.

**Dev vs prod:** Convex dev and prod deployments have different URLs. Use dev URLs in `apps/web/.env.local` when running locally; set **prod** `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in your production hosting (e.g. Vercel env vars) so the production build talks to your prod Convex deployment.

### 3. Start the application

```bash
# Terminal 1: Convex
bunx convex dev

# Terminal 2: Web
bun run dev:web
```

Open http://localhost:5173

### Additional Commands

```bash
# Build for production
bun run build:prod

# Push Convex env vars (from .env)
bun run convex:env:push
```

## Architecture

### Content Processing Pipeline

1. **Ingestion**: Upload file/URL/text → Stored in Convex storage
2. **Extraction**: Convex job extracts content
   - Images → Mistral OCR
   - Videos/Social → Supadata (transcripts)
   - Web → Supadata (scraping)
3. **Splitting**: Chunk content (1000 chars, 200 overlap)
4. **Title Generation**: Together AI generates source title
5. **Embedding**: Embeddings stored and queried via Convex
6. **Storage**: Vectors and documents in Convex

### Generation Pipeline

1. **Request**: User selects format and sources
2. **Job Creation**: Convex action/mutation queues the job
3. **Processing**: LangChain agent generates content using RAG
4. **Real-time**: Frontend subscribes to Convex for status and results
5. **Delivery**: Generated content displayed when complete
