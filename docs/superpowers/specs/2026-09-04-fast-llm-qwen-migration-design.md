# Fast LLM Qwen Migration Design

**Date:** 2026-09-04  
**Status:** Approved for implementation planning

## Goal

Replace the deprecated `openai/gpt-oss-20b` fast-model default with
`Qwen/Qwen3.5-9B` across SolomindLM's executable configuration, tests,
evaluators, operator documentation, and deployed Convex environments. Replace
the Qwen chat-picker option `Qwen/Qwen3.7-Max` with
`Qwen/Qwen3.8-Flash`.

## Scope

### Included

- The `FAST_LLM` fallback in `convex/_lib/env.ts`.
- `FAST_LLM` examples in `.env.example` and `README.md`.
- Current repository instructions in `AGENTS.md` and `CLAUDE.md`.
- Fast/map-model fixture values and assertions in Convex agent tests.
- Default or hard-coded GPT-OSS evaluator models in `evals/rag/metrics/`.
- The Qwen entry in `apps/web/src/shared/constants/models.ts` and its catalog
  test.
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

`mergeModelKwargs` will gain model-specific Qwen branches. Qwen 3.5 9B always
uses `{ reasoning: { enabled: false } }` because it is the non-reasoning fast
model. Qwen 3.8 Flash uses `{ reasoning: { enabled: true } }` in the smart
phase used by chat and `{ reasoning: { enabled: false } }` in the fast phase.
The existing GPT-OSS branch remains to preserve compatibility for a deliberately
configured legacy `FAST_LLM` value until the provider removes it. All other
model handling remains unchanged.

## Chat model selection

The chat picker continues to use smart-phase model construction. Its Qwen
option changes from Qwen 3.7 Max to Qwen 3.8 Flash and displays a name and
description that identify it as a reasoning-capable, long-context model.
Selecting it saves `Qwen/Qwen3.8-Flash`; the chat wrapper then passes the smart
phase to `mergeModelKwargs`, enabling reasoning for that request.

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

- Unit-test Qwen 3.5's non-reasoning fast mapping and Qwen 3.8 Flash's
  reasoning-enabled chat mapping, while retaining the legacy GPT-OSS mapping
  test.
- Run the agent graph smoke test using the Qwen fast model.
- Run the web model-catalog test to prove Qwen 3.8 Flash is selectable.
- Run `bun run typecheck:convex`, `bun run typecheck:web`, `bun run lint`, and
  `bun run test:convex`.
- Confirm the dev and production `FAST_LLM` variables have the Qwen value
  through the available deployment tooling.
