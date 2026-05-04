# Contributing to SolomindLM

Thank you for your interest in contributing to SolomindLM! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code:

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.2.2+
- [Node.js](https://nodejs.org) v20.0.0+
- A [Convex](https://convex.dev) account
- Git

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/SolomindLM.git
   cd SolomindLM
   ```
3. **Add the upstream remote:**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/SolomindLM.git
   ```
4. **Install dependencies:**
   ```bash
   bun install
   ```
5. **Set up Convex:**
   ```bash
   bun x convex dev
   ```
6. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   bun run convex:env:push
   ```
7. **Verify everything works:**
   ```bash
   bun run typecheck:web
   bun run typecheck:convex
   bun run test:convex
   ```

## Development Workflow

### Branch Naming

Use the following prefixes for branches:

- `feature/` — New features
- `fix/` — Bug fixes
- `refactor/` — Code refactoring
- `docs/` — Documentation changes
- `chore/` — Maintenance tasks
- `test/` — Test additions or improvements

Examples:

```bash
git checkout -b feature/rag-citation-improvements
git checkout -b fix/oauth-redirect-bug
git checkout -b docs/api-documentation
```

### Making Changes

1. **Create a branch** from `main`:

   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feature/your-feature
   ```

2. **Make your changes** with clear, focused commits

3. **Test your changes:**

   ```bash
   # Type checking
   bun run typecheck:web
   bun run typecheck:convex

   # Linting
   bun run lint

   # Testing
   bun run test:convex
   bun run test:web
   ```

4. **Format your code:**
   ```bash
   bun run format
   ```

## Pull Request Process

1. **Update your branch** with the latest `main`:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your branch** to your fork:

   ```bash
   git push origin feature/your-feature
   ```

3. **Open a Pull Request** on GitHub with:
   - Clear title following conventional commits format
   - Description of changes and motivation
   - Screenshots/GIFs for UI changes
   - Link to related issues

4. **Address review feedback** promptly

5. **Wait for CI** to pass (typecheck, build, tests)

6. **Squash merge** when approved

### PR Checklist

Before submitting a PR, ensure:

- [ ] Code follows the project's style guidelines
- [ ] All tests pass (`bun run test:convex` and `bun run test:web`)
- [ ] Type checking passes (`bun run typecheck:web` and `bun run typecheck:convex`)
- [ ] Code is formatted (`bun run format`)
- [ ] No linting errors (`bun run lint`)
- [ ] Documentation is updated (if needed)
- [ ] Commit messages follow conventional commits
- [ ] PR description is clear and complete

## Coding Standards

### TypeScript

- Use strict TypeScript features
- Avoid `any` types when possible
- Use explicit return types for exported functions
- Leverage path aliases (`@/*` for web, `@convex/*` for backend)

### React

- Use functional components with hooks
- Follow the existing feature-based organization
- Use Radix UI primitives for accessibility
- Style with TailwindCSS utility classes

### Convex

- Use TypeScript for all functions
- Follow the domain-driven organization (`convex/notebooks/`, `convex/chat/`, etc.)
- Write tests for new queries and mutations (`.test.ts` files)
- Use `ConvexError` for error handling
- Log errors via the service logger

### File Organization

```
feature-name/
├── components/       # React components
├── hooks/            # Custom hooks
├── utils/            # Utility functions
├── types.ts          # TypeScript types
└── index.ts          # Public exports
```

## Testing

### Writing Tests

**Convex tests** use vitest + convex-test:

```typescript
// convex/notebooks/myFunction.test.ts
import { test, expect } from "vitest";
import { convexTest } from "convex-test";

const t = convexTest();

test("my function works", async () => {
  const result = await t.query(api.notebooks.myFunction, { arg: "value" });
  expect(result).toEqual(expected);
});
```

**Web tests** use vitest + Testing Library:

```typescript
// apps/web/src/features/myFeature/MyComponent.test.tsx
import { render, screen } from "@testing-library/react";
import { MyComponent } from "./MyComponent";

test("renders correctly", () => {
  render(<MyComponent />);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});
```

### Test Coverage

Aim for high test coverage, especially for:

- Convex queries and mutations
- Utility functions
- Complex UI components

Run coverage reports:

```bash
bun run test:web:coverage
```

### E2E Tests

For user-facing features, add Playwright tests:

```typescript
// e2e/myFeature.spec.ts
import { test, expect } from "@playwright/test";

test("user can complete workflow", async ({ page }) => {
  await page.goto("/");
  // ... test steps
});
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org):

```
<type>[<scope>]: <description>

[optional body]

[optional footer]
```

Types:

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Formatting (no code change)
- `refactor:` — Code refactoring
- `perf:` — Performance improvement
- `test:` — Tests
- `chore:` — Maintenance

Examples:

```
feat(chat): add citation support to RAG responses
fix(auth): resolve Google OAuth redirect loop
docs(readme): update environment variables section
refactor(notebooks): simplify folder structure
test(convex): add tests for document processing
```

## Documentation

- Update README.md if you change setup instructions
- Update this file if you change contribution guidelines
- Add JSDoc comments to exported functions
- Include examples in documentation

### Documentation Files

- `README.md` — Project overview and setup
- `CONTRIBUTING.md` — This file
- `docs/` — Architecture decisions and specs
- Code comments — Inline documentation

## Questions?

- 📖 Check the [README](README.md)
- 🐛 [Open an issue](https://github.com/samintisar/SolomindLM/issues)
- 💬 Start a discussion

Thank you for contributing! 🎉
