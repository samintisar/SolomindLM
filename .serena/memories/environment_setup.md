# Environment Setup

## Requirements
- **Bun** v1.2+ runtime
- **Node.js** v20.0+ (for compatibility)
- **Git** for version control

## Required Environment Variables

### Root `.env` (Convex)
```
CONVEX_DEPLOYMENT=<your-convex-dev-url>
QWEN_API_KEY=<qwen-llm-key>
MISTRAL_API_KEY=<mistral-api-key>
TAVILY_API_KEY=<tavily-search-key>
SUPADATA_API_KEY=<supadata-extraction-key>
ELEVENLABS_API_KEY=<elevenlabs-audio-key>
ZEROENTROPY_API_KEY=<zeroentropy-reranking-key>
```

### Web App `apps/web/.env.local` (Development)
```
VITE_CONVEX_URL=https://your-dev-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-dev-deployment.convex.site
```

### Production Environment (Vercel/Hosting)
```
VITE_CONVEX_URL=https://your-prod-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-prod-deployment.convex.site
```

## Setup Steps

1. **Install Bun** (if not already installed)
   ```powershell
   # PowerShell
   irm bun.sh/install.ps1 | iex
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Configure Environment**
   - Copy `.env.example` to `.env` in project root
   - Set all required Convex & AI service keys
   - Copy `apps/web/.env.example` to `apps/web/.env.local`
   - Set `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`

4. **Push Environment Variables to Convex**
   ```bash
   bun run convex:env:push
   ```

## Dev vs Production URLs
- **Dev**: Use dev deployment URLs in `.env.local` when running locally
- **Prod**: Set prod URLs in hosting environment variables (e.g., Vercel)
