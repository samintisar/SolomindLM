# SolomindLM

Research SaaS application with AI-powered document ingestion pipeline.

## Tech Stack

- **Frontend**: React, Vite, TypeScript
- **Backend**: Express, TypeScript, LangChain
- **Database**: Supabase (PostgreSQL + pgvector)
- **Background Jobs**: Graphile Worker
- **AI**: Cohere (embeddings), Together AI (titles), Mistral (OCR)

## Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment**

   Copy `apps/api/.env.example` to `apps/api/.env` and add your keys:
   ```bash
   # Supabase (from Dashboard → Settings → API)
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=

   # Database (from Dashboard → Settings → Database → Connection String - Transaction mode)
   DATABASE_URL=

   # AI Services
   COHERE_API_KEY=
   MISTRAL_API_KEY=
   TOGETHER_AI_API_KEY=
   ```

3. **Start the application**

   ```bash
   # Terminal 1: API
   pnpm dev:api

   # Terminal 2: Background worker
   pnpm --filter @solomindlm/api worker

   # Terminal 3: Web
   pnpm dev:web
   ```

   Open http://localhost:5173

## Ingestion Pipeline

1. Upload file/URL → Stored in Supabase Storage
2. Background job processes:
   - Extract (Mistral OCR / YouTube)
   - Split (1000 chars, 200 overlap)
   - Generate title (Together AI)
   - Embed (Cohere)
   - Store vectors (Supabase pgvector)

## Project Structure

```
SolomindLM/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # Express backend
├── pnpm-workspace.yaml
└── package.json
```
