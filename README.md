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
- Bun runtime, Express, TypeScript, LangChain
- Supabase (PostgreSQL + pgvector)
- Graphile Worker (background jobs)

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
│   └── api/                    # Express backend
│       └── src/
│           ├── routes/         # API endpoints
│           ├── services/
│           │   ├── agents/     # LangChain agents (ReportGraph, MindMapGraph)
│           │   ├── discovery/  # Tavily web search
│           │   ├── extraction/ # Supadata content extraction
│           │   ├── generation/ # Report & mind map generation
│           │   └── jobs/       # Background jobs (Graphile Worker)
│           └── utils/          # Worker utilities
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

Copy `apps/api/.env.example` to `apps/api/.env`:

```bash
# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Supabase (from Dashboard → Settings → API)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Database (from Dashboard → Settings → Database → Connection String - Transaction mode)
DATABASE_URL=

# AI Services
OPENAI_API_KEY=                          # Embeddings
ZEROENTROPY_API_KEY=                     # Reranking
MISTRAL_API_KEY=                         # OCR for images
TOGETHER_AI_API_KEY=                     # LLM & title generation
TOGETHER_AI_MODEL=

# Content Discovery & Extraction
TAVILY_API_KEY=                          # Web source discovery
SUPADATA_API_KEY=                        # YouTube, TikTok, Instagram, X transcripts

# Generation
REPORT_MAX_TOKENS=24000
```

### 3. Start the application

```bash
# Terminal 1: API
bun run dev:api

# Terminal 2: Background worker
bun run worker

# Terminal 3: Web
bun run dev:web
```

Open http://localhost:5173

### Additional Commands

```bash
# Clear all pending jobs from the queue
bun run clear-jobs

# Build for production
bun run build:prod

# Type checking
cd apps/api && bun run type-check
```

## Architecture

### Content Processing Pipeline

1. **Ingestion**: Upload file/URL/text → Stored in Supabase Storage
2. **Extraction**: Background job extracts content
   - Images → Mistral OCR
   - Videos/Social → Supadata (transcripts)
   - Web → Supadata (scraping)
3. **Splitting**: Chunk content (1000 chars, 200 overlap)
4. **Title Generation**: Together AI generates source title
5. **Embedding**: Cohere creates vector embeddings
6. **Storage**: Vectors stored in Supabase pgvector

### Generation Pipeline

1. **Request**: User selects format and sources
2. **Job Creation**: Background job queued via Graphile Worker
3. **Processing**: LangChain agent generates content using RAG
4. **Polling**: Frontend polls job status
5. **Delivery**: Generated content displayed when complete
test
