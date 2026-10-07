# Local dev environment

Reference for running SolomindLM locally. `AGENTS.md` keeps the short version; details live here.

## Env files and Convex env sync

Bun 1.2+ required. Required env vars: `CONVEX_DEPLOYMENT` plus AI service keys (Together AI, Mistral,
Tavily, Supadata, Voyage AI, OpenAI, …). Dev backend env lives in `.env.local`; prod in `.env`.
Local `apps/web/.env.local` uses the **dev** Convex URL; production hosting (Vercel) uses the prod URL.

```bash
bun run convex:env:pull:dev    # Pull Convex dev → .env.local
bun run convex:env:pull:prod   # Pull Convex prod → .env
bun run convex:env:push        # Push .env.local → Convex dev
bun run convex:env:push:prod   # Push .env → Convex prod
bun run convex:env:push:dry    # Dry run
```

## RAG evals

One-shot bootstrap: `bun run eval:rag:bootstrap-env` (reads `VITE_CONVEX_URL` from `apps/web/.env.local`,
appends secrets to repo-root `.env`, runs `npx convex env set …` against dev). Template:
[`evals/rag/env.eval.example`](../../evals/rag/env.eval.example). The push script does NOT upload
`RAG_EVAL_CONVEX_URL` (CLI-only). Prefer `--case <id>` / `--runner <name>` for scoped runs (`--runner studio` selects the
studio kinds); `eval:studio` is for cross-cutting work. Use-case packs (`evals/rag/usecases/`): `bun run eval:seed`
then `bun run eval:usecases` (needs `RAG_EVAL_OWNER_EMAIL` on the dev deployment).

## Dev servers and worktrees

- `dev:web` / `dev:mobile` go through `apps/web/scripts/dev-server.ts`. The main checkout gets :5173 /
  :8081; each worktree gets a stable port of its own (web 5174-5199, Metro 8082-8107, hashed from its
  path) and the launcher prints it. It only ever stops this checkout's own leftover server (PID recorded
  in `.dev-servers/`), never another worktree's. Pin with `WEB_PORT` / `PORT` / `METRO_PORT`.
- The web port range is mirrored in `convex/_lib/allowedOrigins.ts` (CORS); widen both together.
- Playwright targets the current checkout's server.
- Google/Apple sign-in always returns to `SITE_URL` (:5173), so use email/password in a worktree.
- **One `convex dev` watcher per dev deployment.** Every worktree's `.env.local` points at the same cloud
  dev deployment, and each watcher pushes its own checkout's functions on save, so two watchers
  overwrite each other. `bun run dev:convex` (`scripts/convex-dev.ts`) refuses to start a second watcher
  while another checkout holds the lock (in the shared git dir, `convex-dev/`); push from other
  worktrees with `bun run dev:convex --once`. `--force` takes over a stale lock. Local/anonymous
  deployments aren't locked. Plain `bun x convex dev` bypasses the guard. Don't create a cloud dev
  deployment per worktree to get around it: the team's Convex deployment quota is 40, and PR previews
  already use it (see `.github/BRANCHING.md` → PR previews).
- **Vite cache after API path changes:** `rm -rf apps/web/node_modules/.vite` and hard-refresh.

## Editor and agent hooks

- **Git hooks** (enabled by `bun install` via `core.hooksPath=.githooks`): `pre-commit` Biome-fixes and
  re-stages the staged files; `pre-push` runs every typecheck + Biome + design-lint (~20s warm). Bypass a
  WIP commit/push with `--no-verify`.
- **Claude Code** (`.claude/settings.json`, tracked; personal overrides go in the ignored
  `.claude/settings.local.json`): [`.claude/hooks/on-edit.mjs`](../../.claude/hooks/on-edit.mjs) runs after
  every single-file edit (built-in `Edit`/`Write` and Serena's edit tools):
  - **format** (sync) — `biome check --write` on the edited file only; errors Biome can't fix go back to
    the agent immediately.
  - **typecheck** (async) — the edited file's workspace typecheck. A burst of edits coalesces into one
    run; failures (and the later recovery) reach the agent on its next turn.
  - Multi-file Serena tools (`rename_symbol`, `replace_in_files`) aren't formatted per edit — the
    pre-commit hook is the backstop.
- **Cursor:** agent hooks live in `.cursor/hooks.json` (use `run-hook.cmd` on Windows). Ensure
  `Bash(bun run typecheck:*)` is in `permissions.allow`. Restart Cursor after hook changes; check
  **Settings → Hooks** and the **Hooks** output channel. Disable `security-guidance` on Windows if
  `python3` is missing.

## Agent skills

Canonical skill source: `.agents/skills/<name>/SKILL.md` (in git). Claude Code reads `.claude/skills/`
(gitignored). After cloning, run once:

```bash
ln -s ../.agents/skills .claude/skills              # Unix
cmd /c mklink /J .claude\skills .agents\skills      # Windows (junction)
```

Convex agent skills can be installed with `npx convex ai-files install`.
