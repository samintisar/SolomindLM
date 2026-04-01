# SolomindLM - Project Overview

## Purpose
AI-powered research platform with multi-source content ingestion, RAG-based chat, and automated content generation.

## Monorepo Structure (Bun Workspaces)
- `apps/web/` - React 19.2 + Vite frontend
- `convex/` - Convex backend (auth, database, functions, agents)

## Key Features
- **Content Ingestion**: Multi-format uploads (PDF, TXT, MD, DOCX, Images, Audio), web scraping, social media transcripts (YouTube, TikTok, Instagram, X), web discovery via Tavily API
- **AI Tools**: Chat (RAG-powered with citations), Reports (8+ formats), Flashcards, Quizzes, Mind Maps, Audio Overviews, Slide Decks, Spreadsheets, Written Questions
- **Organization**: Notebooks with custom icons/colors, Sources Panel, Status Tracking

## Processing Pipelines

### Content Processing Pipeline
1. Ingestion → Convex storage
2. Extraction (OCR via Mistral, transcripts via Supadata)
3. Splitting with smart strategies per content type
4. Embedding and vector storage (1536 dimensions)
5. Reranking with ZeroEntropy

### Generation Pipeline
1. User request → Convex job queue
2. LangChain agent processes with RAG
3. Streaming via persistent text streaming
4. Content delivery when complete
