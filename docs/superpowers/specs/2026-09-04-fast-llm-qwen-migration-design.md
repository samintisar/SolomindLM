# Fast LLM Qwen Migration Design

**Date:** 2026-09-04  
**Status:** Approved for implementation planning

## Goal

Replace the deprecated `openai/gpt-oss-20b` fast-model default with
`Qwen/Qwen3.5-9B` across SolomindLM's executable configuration, tests,
evaluators, operator documentation, and deployed Convex environments.

## Scope

### Included

- The `FAST_LLM` fallback in `convex/_lib/env.ts`.
- `FAST_LLM` examples in `.env.example` and `README.md`.
- Current repository instructions in `AGENTS.md` and `CLAUDE.md`.
- Fast/map-model fixture values and assertions in Convex agent tests.
- Default or hard-coded GPT-OSS evaluator models in `evals/rag/metrics/`.
- The development and production Convex `FAST_LLM` environment variables.

### Excluded

- `SMART_LLM` and its studio-specific overrides.
- Historical design documents and plans: they retain an accurate record of
  their original decision.
- Bundled Together AI skill/reference material: it documents the provider and
  is not SolomindLM runtime configuration.
- Any locally overridden `.env` or `.env.local` file, which can contain
  developer-specific credentials and choices.

## Model Configuration

The canonical fast model becomes:

```text
Qwen/Qwen3.5-9B
```

Together AI documents this identifier for the Chat Completions API and shows
fast-path requests with `reasoning: { enabled: false }`.

`mergeModelKwargs` will gain a Qwen 3.5 branch. It will return
`{ reasoning: { enabled: false } }` for the fast phase and
`{ reasoning: { enabled: true } }` when Qwen is explicitly used in the smart
phase. The existing GPT-OSS branch remains to preserve compatibility for a
deliberately configured legacy `FAST_LLM` value until the provider removes it.
All other model handling remains unchanged.

## Deployment Flow

1. Update source defaults, executable references, tests, and current operator
   documentation.
2. Run targeted tests and repository quality gates before changing a hosted
   environment.
3. Set `FAST_LLM=Qwen/Qwen3.5-9B` on the development Convex deployment.
4. Set the same value on production after the source validation succeeds.

The connected Convex production deployment is currently read-only through the
available integration. Its environment variable must therefore be updated with
an authenticated CLI or dashboard session if that restriction remains.

## Failure Handling and Rollback

- If Qwen rejects a request option or fails the targeted model smoke test, do
  not update either deployment environment. Fix the compatibility layer first.
- The fast-model change is reversible by restoring the previous `FAST_LLM`
  deployment value. Existing GPT-OSS keyword handling remains in source during
  the transition for this purpose.
- Application code continues to honor an explicit `FAST_LLM` environment
  override, so a deployment value takes precedence over the source fallback.

## Verification

- Unit-test the Qwen fast and smart argument mappings, while retaining the
  legacy GPT-OSS mapping test.
- Run the agent graph smoke test using the Qwen fast model.
- Run `bun run typecheck:convex`, `bun run typecheck:web`, `bun run lint`, and
  `bun run test:convex`.
- Confirm the dev and production `FAST_LLM` variables have the Qwen value
  through the available deployment tooling.
