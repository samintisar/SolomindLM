/**
 * Gold-passage retrieval metrics (D1).
 *
 * A fixture's `expectedPassages` are verbatim source quotes that a correct answer needs. A chunk
 * holds a passage when the normalised quote appears in its text. These metrics score retrieval
 * for fixtures that have no `expectedItems`, where the item-based metrics are blind.
 *
 * Each chunk is checked on its own. A quote is never matched across two chunks: selected and
 * post-rerank chunks are ordered by score, not by position in the document, and a quote of at most
 * 30 words fits inside one ~220-token chunk (55-token overlap), so a cross-chunk match cannot arise.
 */
import type {
  ChunkSnapshot,
  EvalFixture,
  EvalRunArtifact,
  MetricResult,
  MetricStatus,
} from "../types";
import { metricResult } from "./metricResult";

// Sentinels that keep a decimal point or thousands comma inside a number through the punctuation
// step. Built from char codes: a private-use character written in source is invisible, and
// formatters rewrite escapes of it into the raw character.
const DECIMAL_POINT = String.fromCharCode(0xe000);
const THOUSANDS_COMMA = String.fromCharCode(0xe001);
const NON_WORD = new RegExp(`[^\\p{L}\\p{M}\\p{N}\\s${DECIMAL_POINT}${THOUSANDS_COMMA}]`, "gu");
const NO_PASSAGES_DETAIL = "No expectedPassages on this fixture; passage metrics not scored.";

/**
 * Comparison form of a text: lowercase; NFKC; apostrophes dropped (so "l'ai" and "l’ai" agree);
 * every other punctuation mark, dash, quote and markdown symbol becomes a word break; a decimal
 * point or thousands comma between digits is kept; whitespace is collapsed. Quote and source go
 * through the same function, so a verbatim quote always matches its source.
 */
export function normalisePassageText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(\p{N})\.(?=\p{N})/gu, `$1${DECIMAL_POINT}`)
    .replace(/(\p{N}),(?=\p{N})/gu, `$1${THOUSANDS_COMMA}`)
    .replace(/['‘’ʼ`´]/g, "")
    .replace(NON_WORD, " ")
    .split(DECIMAL_POINT)
    .join(".")
    .split(THOUSANDS_COMMA)
    .join(",")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether the normalised quote appears in the chunk text on word boundaries. */
export function passageFound(chunkText: string, quote: string): boolean {
  const needle = normalisePassageText(quote);
  if (needle === "") return false;
  return ` ${normalisePassageText(chunkText)} `.includes(` ${needle} `);
}

/** The text a metric sees for a chunk: what the model was shown when it exists. */
const chunkText = (chunk: ChunkSnapshot): string => chunk.contextText ?? chunk.content;

interface StageCoverage {
  /** Per passage: found in some chunk of the stage. */
  found: boolean[];
  /** Per chunk (same order as the stage): the passage indices it holds. */
  chunkPassages: Set<number>[];
}

/** Which passages each chunk of a stage holds, one chunk at a time. */
function stageCoverage(chunks: ChunkSnapshot[], passages: string[]): StageCoverage {
  const texts = chunks.map(chunkText);
  const found = passages.map(() => false);
  const chunkPassages = chunks.map(() => new Set<number>());
  passages.forEach((quote, p) => {
    texts.forEach((text, i) => {
      if (passageFound(text, quote)) {
        found[p] = true;
        chunkPassages[i].add(p);
      }
    });
  });
  return { found, chunkPassages };
}

const recallOf = (found: boolean[]): number =>
  found.length === 0 ? 1 : found.filter(Boolean).length / found.length;

/** Binary-relevance nDCG: DCG = sum(rel_i / log2(i + 1)), normalised by the ideal ordering. */
function binaryNdcg(relevance: number[]): number {
  let dcg = 0;
  relevance.forEach((rel, i) => {
    dcg += rel / Math.log2(i + 2);
  });
  const ideal = [...relevance].sort((a, b) => b - a);
  let idcg = 0;
  ideal.forEach((rel, i) => {
    idcg += rel / Math.log2(i + 2);
  });
  return idcg === 0 ? 0 : dcg / idcg;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// ─── Passage recall per stage ────────────────────────────────

/**
 * Share of expected passages each stage holds. Pre- and post-rerank are info; selected is graded
 * (pass >= 0.8, warn >= 0.5). The selected row also carries the upstream recalls, so a failure can
 * be routed: a higher upstream recall means context selection dropped passages.
 */
export function passageRecallByStage(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult[] {
  const passages = fixture.expectedPassages ?? [];
  const stages = [
    { metric: "passage_recall_pre_rerank", label: "pre-rerank", chunks: artifact.preRerankChunks },
    {
      metric: "passage_recall_post_rerank",
      label: "post-rerank",
      chunks: artifact.postRerankChunks,
    },
    { metric: "passage_recall_selected", label: "selected", chunks: artifact.selectedChunks },
  ];

  if (passages.length === 0) {
    return stages.map((s) =>
      metricResult(s.metric, fixture, artifact, "info", 1, NO_PASSAGES_DETAIL)
    );
  }

  const scored = stages.map((stage) => {
    const coverage = stageCoverage(stage.chunks, passages);
    return { ...stage, coverage, score: recallOf(coverage.found) };
  });
  const [pre, post] = scored;

  return scored.map((stage) => {
    const { found } = stage.coverage;
    const missing = passages.filter((_, p) => !found[p]);
    const hits = found.filter(Boolean).length;
    const detail =
      missing.length === 0
        ? `All ${passages.length} expected passages found at ${stage.label} stage (${stage.chunks.length} chunks).`
        : `Found ${hits}/${passages.length} at ${stage.label} stage. Missing: ${missing
            .map((q) => `"${truncate(q, 60)}"`)
            .join(", ")}`;
    const breakdown: Record<string, unknown> = {
      stage: stage.label,
      found: passages.filter((_, p) => found[p]),
      missing,
      chunkCount: stage.chunks.length,
    };

    if (stage.metric !== "passage_recall_selected") {
      return metricResult(stage.metric, fixture, artifact, "info", stage.score, detail, breakdown);
    }
    const status: MetricStatus = stage.score >= 0.8 ? "pass" : stage.score >= 0.5 ? "warn" : "fail";
    return metricResult(stage.metric, fixture, artifact, status, stage.score, detail, {
      ...breakdown,
      preRerankRecall: pre.score,
      postRerankRecall: post.score,
    });
  });
}

// ─── Selected-context precision and nDCG ─────────────────────

/** Per selected chunk, whether it holds at least one expected passage. */
function selectedRelevance(
  artifact: EvalRunArtifact,
  passages: string[]
): { relevance: number[]; chunkPassages: Set<number>[] } {
  const { chunkPassages } = stageCoverage(artifact.selectedChunks, passages);
  return { relevance: chunkPassages.map((s) => (s.size > 0 ? 1 : 0)), chunkPassages };
}

/**
 * Share of selected chunks that hold an expected passage. Lenient on purpose: selection pads with
 * neighbours and openings, which are context, not misses. Pass >= 0.4, warn >= 0.2.
 */
export function passagePrecisionSelected(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult {
  const metric = "passage_precision_selected";
  const passages = fixture.expectedPassages ?? [];
  if (passages.length === 0)
    return metricResult(metric, fixture, artifact, "info", 1, NO_PASSAGES_DETAIL);

  const total = artifact.selectedChunks.length;
  if (total === 0) {
    return metricResult(
      metric,
      fixture,
      artifact,
      "fail",
      0,
      "No chunks selected; precision undefined."
    );
  }
  const { relevance, chunkPassages } = selectedRelevance(artifact, passages);
  const relevant = relevance.filter((r) => r === 1).length;
  const score = relevant / total;
  const status: MetricStatus = score >= 0.4 ? "pass" : score >= 0.2 ? "warn" : "fail";

  return metricResult(
    metric,
    fixture,
    artifact,
    status,
    score,
    `${relevant}/${total} selected chunks contain an expected passage.`,
    {
      relevant,
      total,
      chunkRelevance: artifact.selectedChunks.map((c, i) => ({
        id: c.id,
        passages: [...chunkPassages[i]],
      })),
    }
  );
}

/** Binary-relevance nDCG over the selected chunks in order. Pass >= 0.7, warn >= 0.4. */
export function passageNdcgSelected(fixture: EvalFixture, artifact: EvalRunArtifact): MetricResult {
  const metric = "passage_ndcg_selected";
  const passages = fixture.expectedPassages ?? [];
  if (passages.length === 0)
    return metricResult(metric, fixture, artifact, "info", 1, NO_PASSAGES_DETAIL);

  if (artifact.selectedChunks.length === 0) {
    return metricResult(
      metric,
      fixture,
      artifact,
      "fail",
      0,
      "No chunks selected; nDCG undefined."
    );
  }
  const { relevance } = selectedRelevance(artifact, passages);
  const score = binaryNdcg(relevance);
  const status: MetricStatus = score >= 0.7 ? "pass" : score >= 0.4 ? "warn" : "fail";
  const relevantCount = relevance.filter((r) => r === 1).length;

  return metricResult(
    metric,
    fixture,
    artifact,
    status,
    score,
    `nDCG@${relevance.length} = ${score.toFixed(3)} (${relevantCount}/${relevance.length} chunks hold an expected passage).`,
    { k: relevance.length, relevance, relevantCount }
  );
}

// ─── Inputs for abstention correctness ───────────────────────

/**
 * Passage recall per stage, plus the share of passages the answer quotes verbatim. The answer
 * share is diagnostic only: an answer rarely copies a source sentence, so it is not used by the
 * abstention rules.
 */
export function passageAbstentionRecalls(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): {
  selectedRecall: number;
  preRerankRecall: number;
  postRerankRecall: number;
  answerRecall: number;
} {
  const passages = fixture.expectedPassages ?? [];
  return {
    selectedRecall: recallOf(stageCoverage(artifact.selectedChunks, passages).found),
    preRerankRecall: recallOf(stageCoverage(artifact.preRerankChunks, passages).found),
    postRerankRecall: recallOf(stageCoverage(artifact.postRerankChunks, passages).found),
    answerRecall: recallOf(passages.map((p) => passageFound(artifact.answer, p))),
  };
}
