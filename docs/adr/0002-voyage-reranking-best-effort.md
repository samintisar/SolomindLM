# 0002. Switch reranking to Voyage AI and make it best-effort

- **Status:** Proposed
- **Date:** 2026-10-03
- **Deciders:** @samintisar
- **PR:** #<!-- the PR that carries this ADR -->

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

Reranking is **best-effort**: one attempt, a hard `RERANK_TIMEOUT_MS` (8s), no
retries. On any failure callers continue with the un-reranked order. The cache
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
- Voyage relevance scores are not calibrated like ZeroEntropy's (an unrelated
  passage still scores about 0.3), so `CHAT_MIN_RELEVANCE_THRESHOLD` (0.20) now
  filters less. Re-tune it against `eval:rag`.
- Voyage's higher rate-limit tier needs a payment method on the account.
- Privacy policy subprocessor list now names Voyage AI instead of ZeroEntropy.
- The unused `ZEROENTROPY_API_KEY` / `ZEROENTROPY_RERANK_MODEL` Convex env vars
  can be deleted once the switch is deployed.
