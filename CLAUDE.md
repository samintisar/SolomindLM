# CLAUDE.md

@AGENTS.md

## Claude Code specifics

### Code navigation and editing

- **Serena (MCP)** is preferred for symbol work on `.ts` / `.tsx` when it is active *on this checkout*:
  `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `rename_symbol`, `replace_symbol_body`.
  Serena edits the project it was activated on, so in a worktree either activate it on the worktree path
  or use the built-in `Read` / `Edit` / `Grep` — and confirm edits landed with `git status`.
- Use an `Explore` subagent for searches that need more than ~3 queries.
- After Serena edits, run `bun x biome format --write` on the changed files (Serena can leave CRLF).

### Process skills (superpowers)

Invoke the skill at the start of the phase it covers:

| Skill | When | Project notes |
| --- | --- | --- |
| `superpowers:brainstorming` | Before a new feature, component, or behavior change | Required before `EnterPlanMode` |
| `superpowers:writing-plans` | Multi-step task, before touching code | Output goes in the plan, not memory |
| `superpowers:test-driven-development` | Deterministic logic: `convex/_lib/`, `convex/_model/`, `convex/_agents/_shared/`, web utilities, new queries/mutations | `*.test.ts` next to source. Skip for prompt outputs (evals), UI (Playwright), streaming/scheduler timing |
| `superpowers:systematic-debugging` | Any bug, test failure, or unexpected behavior | Before proposing fixes |
| `superpowers:dispatching-parallel-agents` / `subagent-driven-development` | 2+ independent tasks | — |
| `superpowers:verification-before-completion` | Before claiming done / committing / opening a PR | The validation gates in AGENTS.md |
| `superpowers:requesting-code-review` / `receiving-code-review` | Before merging significant work / handling feedback | — |
| `superpowers:finishing-a-development-branch` | Implementation complete | — |
| `superpowers:writing-skills` | Creating or editing a skill | Edit `.agents/skills/<name>/SKILL.md` |

### Domain skills

| Trigger | Skills |
| --- | --- |
| Schema or table change | `convex-migration-helper` (widen-migrate-narrow) |
| Read amplification, OCC conflicts, `npx convex insights` warnings | `convex-performance-audit` |
| New isolated table-owning module | `convex-create-component` |
| `convex/_agents/` or `studio/*/*JobPhases.ts` | `langchain-fundamentals`, `langchain-rag` (`langgraph-fundamentals` only for state types / legacy graphs) |
| `convex/_services/ai/`, `convex/studio/audio/` | `together-*` (audio, chat-completions, embeddings, evaluations, images, video) |
| React components, Vite config, types, new UI | `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`, `vite`, `web-design-guidelines`, `webapp-testing`, `shadcn` |

### Hooks

`.claude/settings.json` runs [`.claude/hooks/on-edit.mjs`](.claude/hooks/on-edit.mjs) after every
single-file edit: Biome `--write` on that file (sync; unfixable errors come back to you) and the workspace
typecheck (async; failures arrive on your next turn). Details: [`docs/engineering/dev-environment.md`](docs/engineering/dev-environment.md#editor-and-agent-hooks).
