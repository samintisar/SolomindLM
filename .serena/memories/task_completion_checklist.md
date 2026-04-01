# Task Completion Checklist

When a task is completed, run the following checks:

## 1. Type Check
```bash
# Type check both convex and web
bun run typecheck

# Or separately:
bun run typecheck:convex
bun run typecheck:web
```

## 2. Build Check
```bash
bun run build:prod
```

## 3. Review Changes
```bash
git status
git diff
```

## 4. Commit & Push
```bash
git add .
git commit -m "feat: description of changes"
git push -u origin feature/branch-name
```

## 5. Create Pull Request
- Use GitHub UI to create PR
- Reference the PR template: `.github/pull-request-template.md`
- Ensure CI checks pass (Build, Type Check)
- Get at least 1 approval before merging

## Notes
- No linting/formatting commands configured (no ESLint/Prettier)
- No automated tests to run
- Main branch is protected - requires PR + CI checks
