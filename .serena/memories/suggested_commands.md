# Suggested Commands

## Development

### Install Dependencies
```bash
bun install
```

### Start Development Servers
```bash
# Terminal 1: Convex backend
bun x convex dev

# Terminal 2: Web frontend (port 5173)
bun run dev:web

# Or run all workspace dev servers at once
bun run dev
```

## Building & Type Checking

### Build Commands
```bash
bun run build          # Build all workspace packages
bun run build:prod     # Build production web app
```

### Type Check Commands
```bash
bun run typecheck              # Type check both convex and web
bun run typecheck:convex       # Type check convex only
bun run typecheck:web          # Type check web only
```

## Convex Environment Management

### Push Environment Variables
```bash
bun run convex:env:push        # Push .env vars to convex dev
bun run convex:env:push:prod   # Push to production convex
bun run convex:env:push:dry    # Dry run for env push
```

## Windows-Specific Commands (PowerShell/CMD)

### Git Operations
```powershell
git status              # Check working tree status
git add .               # Stage all changes
git commit -m "message" # Commit changes
git checkout -b feature/name  # Create & checkout branch
git push -u origin feature/name  # Push with upstream tracking
```

### File Operations
```powershell
dir                    # List directory contents (like ls)
cd path\to\dir         # Change directory
type filename          # Display file contents (like cat)
```

### Process Management
```powershell
bun run dev:web        # Includes automatic port killing via kill-port script
```