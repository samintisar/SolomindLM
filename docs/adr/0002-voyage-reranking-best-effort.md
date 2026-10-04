# 0002. Switch reranking to Voyage AI and make it best-effort

- **Status:** Proposed
- **Date:** 2026-10-03
- **Deciders:** @samintisar
- **PR:** #307

## Context

Chat and literature review reorder retrieved passages with a hosted reranker.
That was ZeroEntropy `zerank-2`. From 2026-09-29 ZeroEntropy's rerank API
returned `503` with `Retry-After: 86400` for every key, model and region (their
status page showed a major outage with traffic at zero), and its SDK waited the
header out. Nothing in our code bounded the call, so every chat reply stalled
until the browser gave up, which took chat down in production.

ZeroEntropy's published model list had no newer hosted reranker than
`zerank-2`, so there was nothing to upgrade to. Together AI's rerankers
(`mxbai-rerank-large-v2`, `Llama-Rank-V1`) are dedicated-endpoint only.

## Decision

We will rerank with Voyage AI `rerank-3` (`$0.05` / 1M tokens, 200M free tokens
per account), called through a small fetch client
(`convex/_services/ai/voyageRerank.ts`). The model lives in
`convex/_lib/rerankConfig.ts`; the key is `VOYAGE_API_KEY`.

Reranking is **best-effort**: one hard `RERANK_TIMEOUT_MS` (8s) deadline covers
the whole call, and the only retry is a single one after a 429 whose
`Retry-After` is short and fits inside that deadline. On any failure callers
continue with the un-reranked order. The cache
name in `rerankCache.ts` is bumped on a provider or model change so old scores
are never served.

## Alternatives considered

- **Cohere Rerank 3.5** — about `$2` per 1,000 searches, no free tier; roughly
  1.5x Voyage per message.
- **LLM reranking on Together (DeepSeek)** — no new provider, but about 6x the
  cost per message and seconds of added latency.
- **Self-hosting `zerank-1-small`** — Apache-licensed, but we would own GPU
  hosting for a feature that costs cents per month hosted.
- **Keep ZeroEntropy and only add timeouts** — chat would work, but without any
  reranking for as long as their outage lasts.

## Consequences

- Chat survives a reranker outage with slightly lower retrieval quality instead
  of failing.
- Voyage relevance scores are not calibrated like ZeroEntropy's, so
  `CHAT_MIN_RELEVANCE_THRESHOLD` was re-tuned from 0.20 to 0.35 on 2026-10-04.
  Method: collect the 25-chunk candidate pool of 61 chat fixtures (`eval:rag
  --runner chat`, train split plus use-case packs), score each pool with real
  `rerank-3`, and compare against off-topic questions run over the same pools.
  Off-topic chunks score 0.25-0.29 (p99 0.31); 0.35 drops all but 3 of 1,212 of
  them and keeps 100% of the 95 chunks containing an expected item (which score
  0.50-0.94). That 100% is not labeled recall across all 61 fixtures: only 26
  had `expectedItems`, and a chunk counted as useful only if it contained one
  verbatim, a lexical proxy rather than a human judgement. 0.40 also keeps all
  of those but cuts into on-topic context (5% of the top-15 chunks), so 0.35
  leaves a margin on the safe side.
  Chunks past the rerank top-N keep their vector similarity (~0.5) and pass the
  floor either way; unifying those scales is a separate change.
- Voyage's higher rate-limit tier needs a payment method on the account.
- Privacy policy subprocessor list now names Voyage AI instead of ZeroEntropy.
- The unused `ZEROENTROPY_API_KEY` / `ZEROENTROPY_RERANK_MODEL` Convex env vars were
  deleted from dev and prod after the switch was deployed.
