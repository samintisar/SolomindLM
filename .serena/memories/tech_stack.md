# Tech Stack

## Frontend (`apps/web/`)
- React 19.2, Vite 7.x, TypeScript
- TailwindCSS 4.x, Radix UI (lucide-react icons)
- React Router DOM 7.x for routing
- Mind Elixir 5.x (mind maps)
- React Flip Toolkit (flashcards)
- React Markdown + KaTeX (math rendering)
- DOMPurify (HTML sanitization)
- Stripe SDK (payments)

## Backend (`convex/`)
- Convex 1.31+ (backend, auth, storage, real-time)
- Bun runtime, TypeScript
- LangChain (agent orchestration)

### Convex Modules
- `@convex-dev/auth` - Authentication (OTT handler)
- `@convex-dev/stripe` - Stripe integration
- `@convex-dev/persistent-text-streaming` - Streaming responses
- `@convex-dev/action-cache` - Action caching
- `@convex-dev/rate-limiter` - Rate limiting

## AI Services
- **LLMs**: Qwen3 80B (smart), Mistral (fast)
- **Embeddings**: LangChain integration
- **Reranking**: ZeroEntropy
- **OCR**: Mistral for images
- **Web Search**: Tavily API
- **Content Extraction**: Supadata (YouTube, TikTok, Instagram, X, web scraping)
- **Audio**: Eleven Labs (shimmer, echo voices)

## Development Tools
- Bun 1.2+ runtime
- TypeScript 5.9+
- concurrently (run multiple dev servers)

## Path Aliases (tsconfig.json)
- `@/*` → `./src/*`
- `@convex/*` → `../../convex/*`
