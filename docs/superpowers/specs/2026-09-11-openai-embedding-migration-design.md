# OpenAI Embedding Migration Design

**Date:** 2026-09-11
**Status:** Approved for implementation planning
**Tracking issue:** [samintisar/SolomindLM#107](https://github.com/samintisar/SolomindLM/issues/107)

## Goal

Together AI removes its only serverless embedding model,
`intfloat/multilingual-e5-large-instruct`, from serverless inference on
2026-09-14 with no listed replacement. Replace it across SolomindLM's
embedding pipeline with OpenAI's `text-embedding-3-small` at its native 1536
dimensions, consolidate the two duplicated Together-calling implementations
into a single client, and revectorize every existing row in
`documentChunks`.

## Scope

### Included

- `convex/_lib/e5Embedding.ts` → replaced by `convex/_lib/embeddingConfig.ts`:
  model name/dimensions constants, chunk-size constants (values unchanged),
  batch size. The E5 `query:`/`passage:` instruct-prefix concept
  (`E5InputType`, `formatE5Input`) is deleted — OpenAI's model doesn't use it.
- `convex/_services/processing/EmbeddingServiceClient.ts` and
  `convex/_services/ai/embeddings.ts` → consolidated into one new
  `convex/_services/ai/embeddingClient.ts`. One implementation of "call the
  embeddings API" (fetch + retry + parse against
  `https://api.openai.com/v1/embeddings`, no new npm dependency), used by:
  - The `EmbeddingService` class, for direct use inside `"use node"` actions.
  - The Convex `generateEmbeddingInternal` / `generateEmbeddingsBatchInternal`
    / `generateEmbedding` / `generateEmbeddingsBatch` actions, which must stay
    real `FunctionReference`s because `@convex-dev/action-cache` wraps a
    reference, not a plain function. The cache `name` is bumped (e.g.
    `embeddingsV5-openai-3small-1536`) so no stale E5-cached vector can leak
    through after cutover.
- All ~9 call sites that instantiate or call `EmbeddingService`: `ChatAgent.ts`,
  `vector_search.ts`, `hybrid_search.ts`, `grounding_validator.ts`,
  `_streamChatResponse.ts`, `_streamResearch.ts`, `researchEvalAction.ts`,
  `chatEvalAction.ts` — import path updated, `inputType` argument dropped
  (OpenAI needs no query/passage distinction), API key source switched from
  `TOGETHER_AI_API_KEY` to `OPENAI_API_KEY`.
- `convex/documents/embeddingJob.ts` — import path updated, stamps the new
  `embeddingModel` field on every chunk it writes.
- `convex/schema.ts` — `documentChunks` gains
  `embeddingModel: v.optional(v.string())`; the `by_embedding` vector index
  dimension changes from `1024` to `1536`.
- `convex/_migration/reembedChunks.ts` / `reembedBatchesWorker.ts` — switched
  to the new client and `OPENAI_API_KEY`; the re-embed filter changes from
  "vector length ≠ 1024" to "`embeddingModel` ≠ the new model constant" (see
  Migration Correctness below), and the worker stamps `embeddingModel` on
  every row it updates.
- `convex/_lib/env.ts` — adds `OPENAI_API_KEY`.
- Full revectorization of every row in `documentChunks` on the **dev**
  deployment only, via the existing paginated worker.

### Excluded

- Production deployment and production revectorization — explicitly deferred
  to a separate, later step after dev validation (cost, retrieval quality,
  and non-English spot-check) succeeds. Not part of this implementation pass.
- RAG chunk-size/overlap tuning — `E5_RAG_CHUNK_SIZE_TOKENS` /
  `E5_RAG_CHUNK_OVERLAP_TOKENS` values carry over unchanged under their new
  names. Re-tuning chunk granularity to exploit OpenAI's larger context is a
  separate quality initiative, not bundled into an urgent deprecation fix.
- `CHAT_VECTOR_MATCH_COUNT` and other retrieval-tuning env vars in `env.ts` —
  a single query's read set (≈25 chunks × 1536 × 8 bytes ≈ 300KB) is nowhere
  near Convex's 16MB read ceiling, so no tuning is required here.
- `.agents/skills/together-embeddings/references/models.md` — bundled
  provider skill documentation, not SolomindLM runtime configuration; left
  stale intentionally, same rationale as the prior Qwen migration design.
- Any locally overridden `.env`/`.env.local`.

## Model Configuration

```text
Model:      text-embedding-3-small
Dimensions: 1536 (requested explicitly via the API's `dimensions` param,
            not relied on as an implicit default)
```

1536 was chosen over truncating to 1024 for full embedding quality. The
schema's vector index dimension changes accordingly — Convex requires
`dimensions` to exactly match the stored vector length at vector-search time,
so this is a real index change, not an additive one.

## Migration Correctness

`reembedBatchesWorker.ts` currently decides what to re-embed by checking
`embedding.length !== 1024`. If ported unchanged, this check would be
meaningless once the new model is also producing 1536-length vectors that
simply aren't 1024 — coincidentally still "different," but for the wrong
reason, and it stops working the moment a worker restart needs to
distinguish "already on the new model" from "still on the old one" using a
length comparison alone. The robust fix: track provenance directly. Add
`documentChunks.embeddingModel` and filter/re-embed on
`embeddingModel !== EMBEDDING_MODEL` instead of on vector length. This also
makes the migration resumable/idempotent and future-proofs the next model
change.

**Transition window:** while the migration runs, any chunk still holding its
old 1024-length E5 vector will not match the schema's new 1536-dim index and
will drop out of vector search results until it's re-embedded. This is
expected and temporary — it resolves once the dev migration finishes — and
is acceptable because dev is not user-facing production traffic.

## Deployment Flow

1. Implement the consolidated client, config, schema change, and all call-site
   updates on dev.
2. Run `bun run typecheck:convex`, `typecheck:web`, `lint`, `test:convex`.
3. Deploy to the dev Convex backend (`OPENAI_API_KEY` already confirmed
   present there).
4. Run `reembedAllChunks` against dev; monitor `reembedBatchesWorker` logs to
   completion.
5. Validate: retrieval quality (including non-English content, since OpenAI
   doesn't officially document multilingual retrieval quality the way E5 or
   Voyage do), and actual OpenAI cost incurred.
6. Prod deployment and prod revectorization are a separate, explicitly
   confirmed follow-up step — not automatic once dev looks good.

## Failure Handling and Rollback

- Overwriting `embedding` in place is irreversible per chunk (no backup
  column). Acceptable here because it's forced by an external deadline with
  a hard date, and dev is not production data.
- If the OpenAI client fails compatibility or quality checks, do not touch
  prod's `TOGETHER_AI_API_KEY`-based path or its `documentChunks` — Together's
  E5 model remains callable until 2026-09-14, so dev can be iterated on
  safely up to that date.
- `reembedBatchesWorker` is self-rescheduling and paginated; if it errors
  mid-run, the `embeddingModel` filter (not vector length) means a re-run
  correctly resumes only the chunks still left on the old model.

## Verification

- Unit tests for `embeddingConfig.ts` (constants/shape) and
  `embeddingClient.ts` (batch reordering by index, retry behavior), following
  existing patterns in `convex/_lib/` and `convex/_services/`.
- `bun run typecheck:convex`, `bun run typecheck:web`, `bun run lint`,
  `bun run test:convex`.
- Manual: run the dev re-embed migration to completion, spot-check chat/search
  retrieval quality on both English and non-English content, review actual
  OpenAI token cost incurred against the migration.
