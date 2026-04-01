# Code Style & Conventions

## TypeScript Configuration
- **Frontend (`apps/web/`)**: `strict: false` (lax mode)
- **Backend (`convex/`)**: `strict: true` (strict mode)
- Target: ES2022 (web), ESNext (convex)
- Module: ESNext

## Linting & Formatting
- **No ESLint configured** - No automated linting
- **No Prettier configured** - No automated formatting
- **No test suite** - No automated tests

## File Organization
- Feature-based organization in `apps/web/src/features/`
  - `auth/` - Authentication
  - `billing/` - Stripe subscriptions
  - `chat/` - RAG chat with citations & streaming
  - `notebooks/` - Notebook management
  - `sources/` - Source discovery and management
  - `studio/` - AI generation tools

## Schema (Convex)
- Key tables: `notebooks`, `folders`, `documents`, `documentChunks`, `reports`, `audioOverviews`, `flashcards`, `quizzes`
- Vector search: 1536 dimensions
- Status tracking for documents and generation jobs

## Git Workflow (GitHub Flow)
- Branch naming: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`
- Main branch is protected (requires PR + CI checks)
- Squash merge for clean history
- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

## CI Pipeline
- Runs on push to `main` and PRs targeting `main`
- Jobs: Build (Web), Type Check (convex & web)
