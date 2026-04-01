# Important Files & Entry Points

## Root Level
- `package.json` - Workspace configuration, scripts
- `CLAUDE.md` - Project documentation (this file)
- `README.md` - Project overview and setup guide
- `bun.lock` - Bun lockfile for dependencies
- `convex.json` - Convex configuration

## Frontend (`apps/web/`)
- `package.json` - Frontend dependencies and scripts
- `tsconfig.json` - TypeScript config with path aliases
- `src/index.tsx` - Application entry point
- `src/App.tsx` - Root component with routing
- `src/vite-env.d.ts` - Vite type definitions
- `src/react-router-dom.d.ts` - Router type augmentation

## Backend (`convex/`)
- `schema.ts` - Database schema definition
- `auth.config.ts` - Authentication configuration
- `auth.ts` - Authentication functions
- `server.ts` - Server-side functions
- `http.ts` - HTTP action routes
- `convex.config.ts` - Convex deployment config
- `README.md` - Convex-specific documentation

## Key Feature Directories
- `apps/web/src/features/auth/` - Authentication UI
- `apps/web/src/features/billing/` - Stripe subscription UI
- `apps/web/src/features/chat/` - Chat interface with RAG
- `apps/web/src/features/notebooks/` - Notebook management
- `apps/web/src/features/sources/` - Source discovery & management
- `apps/web/src/features/studio/` - AI generation tools

## Convex Modules
- `convex/lib/` - AI agents and processing utilities
- `convex/jobs/` - Background generation jobs
- `convex/storage/` - Vector store and chat history
- `convex/model/` - Data models

## GitHub
- `.github/workflows/` - CI/CD pipeline configurations
- `.github/branch-protection.ps1` - Branch protection setup script
- `.github/BRANCHING.md` - Git workflow documentation
- `.github/pull-request-template.md` - PR template
