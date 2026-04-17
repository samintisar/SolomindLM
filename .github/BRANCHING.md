# GitHub Branching Strategy

This repository uses **GitHub Flow** - a simple, branch-based workflow that's great for continuous delivery.

## Overview

```
main (production)
  ↑
  | pull request + CI checks
  |
feature/* (development)
```

## Rules

| Branch      | Purpose                              | Protection                          |
| ----------- | ------------------------------------ | ----------------------------------- |
| `main`      | Production-ready code                | Protected - requires PR + CI checks |
| `feature/*` | New features, bug fixes, experiments | None                                |

## Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

```bash
git add .
git commit -m "Describe your changes"
```

### 3. Push and Create PR

```bash
git push -u origin feature/your-feature-name
# Then create PR on GitHub
```

### 4. CI Checks Run Automatically

- Type Check (API)
- Build (Web)
- Build (API)

### 5. Review & Merge

- Get at least 1 approval
- Ensure all CI checks pass
- Merge to main (use squash merge for clean history)

### 6. Deploy

- `main` branch deploys automatically to production
- Web → Vercel
- Backend → Convex

## Branch Naming Conventions

| Prefix      | Usage              | Example                       |
| ----------- | ------------------ | ----------------------------- |
| `feature/`  | New features       | `feature/user-authentication` |
| `fix/`      | Bug fixes          | `fix/payment-webhook`         |
| `refactor/` | Code refactoring   | `refactor/api-structure`      |
| `docs/`     | Documentation only | `docs/readme-update`          |
| `chore/`    | Maintenance tasks  | `chore/update-dependencies`   |

## Commit Message Guidelines

Use clear, descriptive commit messages:

```
feat: add user authentication
fix: resolve stripe webhook timeout
refactor: extract database logic to service layer
docs: update API documentation
chore: upgrade dependencies
```

## Setting Up Branch Protection

### Option 1: Using the Provided PowerShell Script (Windows/PowerShell, Recommended)

```powershell
# Run this from a PowerShell prompt
pwsh -File .github/branch-protection.ps1
```

### Option 2: Manual Setup via GitHub UI

1. Go to **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Enter `main` as the branch name pattern
4. Configure:

   | Setting                             | Value                                       |
   | ----------------------------------- | ------------------------------------------- |
   | Require a pull request              | ✅ (1 approval)                             |
   | Require status checks               | ✅                                          |
   | Require branches to be up to date   | ✅                                          |
   | Require status checks to pass       | `Build (Web)`, `Type Check` (as configured) |
   | Do not allow bypassing the settings | ✅                                          |
   | Require resolution of conversations | Optional                                    |

5. Click **Create**

## CI Pipeline Details

The `.github/workflows/ci.yml` runs on:

- Push to `main`
- Pull requests targeting `main`

Jobs:

1. **Build (Web)** - Builds the React frontend
2. **Type Check** - Validates TypeScript (when configured)

## Best Practices

1. **Keep branches short-lived** - Merge PRs within a few days
2. **Small, focused PRs** - Easier to review and less likely to introduce bugs
3. **Write clear PR descriptions** - Use the provided template
4. **Don't break the build** - Fix failing CI before merging
5. **Update `main` frequently** - Sync your feature branch if `main` has moved ahead
