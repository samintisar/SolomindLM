/**
 * Deterministic eval metrics for the RAG evaluation pipeline.
 *
 * Every function is pure TypeScript with no external dependencies.
 * Each metric returns MetricResult[] suitable for direct inclusion in an EvalReport.
 */
import type {
  EvalBaseline,
  EvalFixture,
  EvalRunArtifact,
  MetricResult,
  MetricStatus,
} from "../types";
import { metricResult } from "./metricResult";
import { passageAbstentionRecalls } from "./retrievalGold";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Synonym mappings for common agentic pattern name variations.
 * Maps canonical names to alternative names the LLM might use.
 */
const SYNONYM_MAPPINGS: Record<string, string[]> = {
  routing: ["tool selection", "router", "routing", "intelligent routing"],
  parallelization: ["parallel workers", "parallelization", "multi-worker"],
  "learning and adaptation": ["adaptation", "continuous improvement"],
  "resource-aware optimization": [
    "resource aware",
    "resource optimization",
    "routing by complexity",
  ],
  prioritization: ["task scoring", "triage", "task prioritization"],
  "multi-agent collaboration": ["multi agent", "multi-agent", "agent collaboration"],
  "memory management": ["memory systems"],
  "human in the loop": ["human in the loop", "human-in-the-loop", "human intervention", "hitl"],
  "guardrails and safety patterns": ["guardrails", "guardrail", "safety patterns"],
  "goal setting and monitoring": ["goal setting", "goal monitoring", "smart goals"],
  "exception handling and recovery": ["exception handling", "error handling"],
  "knowledge retrieval": ["retrieval augmented generation", "context retrieval"],
  "inter-agent communication": ["agent communication"],
  "reasoning techniques": ["tree of thought"],
  "tool use": ["tool calling", "function calling"],
  reflection: ["critique", "self-reflection"],
};

/** Words that never count toward the "significant words" rule for multi-word items. */
const STOPWORDS = new Set(["and", "the", "with", "for", "from", "into"]);

/**
 * Words too common in pattern prose to count as evidence for an item: every answer about "the
 * 20 patterns" says "patterns", so "reasoning techniques" must not be credited by it.
 */
const COMMON_ITEM_WORDS = new Set([
  "patterns",
  "techniques",
  "agent",
  "agents",
  "management",
  "systems",
  "based",
]);

/**
 * The canonical name's variations: the term itself plus the synonyms listed under that exact
 * canonical key. Another item's synonym list is never consulted.
 */
function getAllVariations(term: string): string[] {
  const normalized = normalizeForMatch(term);
  const entry = Object.entries(SYNONYM_MAPPINGS).find(
    ([canonical]) => normalizeForMatch(canonical) === normalized
  );
  return [normalized, ...(entry ? entry[1].map(normalizeForMatch) : [])];
}

/** Normalize text for matching: lowercase, remove special chars, normalize spaces */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-‐–—]/g, " ") // Replace all dash types with space
    .replace(/[^\w\s]/g, "") // Remove other special chars
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/**
 * Whole-phrase variations of a term: the term itself, its explicit synonyms, and each of them with
 * one adjacent pair of words joined ("feedforward network" for "feed forward network").
 */
function generateVariations(term: string): string[] {
  const variations = [...new Set(getAllVariations(term))];
  const joined: string[] = [];
  for (const variation of variations) {
    const words = variation.split(" ");
    for (let i = 0; i < words.length - 1; i++) {
      joined.push([...words.slice(0, i), words[i] + words[i + 1], ...words.slice(i + 2)].join(" "));
    }
  }
  return [...new Set([...variations, ...joined])];
}

/**
 * Singular forms of a needle's last word, for the "a neural network" / "neural networks" case.
 * Words of four letters or fewer, and words ending in ss, us, is or os ("rectus", "analysis"),
 * keep their s: it belongs to the stem.
 */
function singularForms(word: string): string[] {
  if (word.length < 5 || /(?:ss|us|is|os)$/.test(word)) return [];
  const forms: string[] = [];
  if (word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.endsWith("s")) forms.push(word.slice(0, -1));
  return forms;
}

/**
 * Whether `phrase` (normalised) appears in the padded haystack as whole words. The last word
 * matches in either number: the needle's plural or singular form, with an optional "s" or "es" in
 * the haystack. Apostrophes are already removed by normalizeForMatch ("Routing's" is "routings").
 */
function hasWholePhrase(paddedHaystack: string, phrase: string): boolean {
  const words = phrase.split(" ");
  const last = words.pop() ?? "";
  if (last === "") return false;
  const lastForms = [last, ...singularForms(last)].join("|");
  const head = words.map((w) => `${w} `).join("");
  return new RegExp(` ${head}(?:${lastForms})(?:es|s)? `).test(paddedHaystack);
}

/**
 * Whether `needle` is found in `haystack` on word boundaries. A multi-word needle matches when
 * its whole phrase or an explicit synonym appears, or on its significant words (4+ chars, not
 * stopwords or COMMON_ITEM_WORDS): all of them when there are two, at least two when there are
 * three or more. An item with fewer than two significant words matches only by phrase or synonym.
 * A single-word needle matches only as itself or a synonym.
 */
function containsFuzzy(haystack: string, needle: string): boolean {
  const paddedHaystack = ` ${normalizeForMatch(haystack)} `;

  if (generateVariations(needle).some((v) => hasWholePhrase(paddedHaystack, v))) {
    return true;
  }

  const words = normalizeForMatch(needle).split(" ");
  if (words.length < 2) {
    return false;
  }
  const significant = [
    ...new Set(
      words.filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !COMMON_ITEM_WORDS.has(w))
    ),
  ];
  if (significant.length < 2) {
    return false;
  }
  // Two significant words: both must appear. Three or more: at least two.
  const found = significant.filter((w) => hasWholePhrase(paddedHaystack, w)).length;
  return found >= 2;
}

/** Case-insensitive substring check (kept for backward compatibility). */
function containsIgnoreCase(haystack: string, needle: string): boolean {
  return containsFuzzy(haystack, needle);
}

/** How many items from `items` are found via fuzzy matching in `text`. */
function countMatches(
  text: string,
  items: string[]
): {
  matched: string[];
  unmatched: string[];
} {
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const item of items) {
    if (containsIgnoreCase(text, item)) {
      matched.push(item);
    } else {
      unmatched.push(item);
    }
  }
  return { matched, unmatched };
}

/** Recall = matched / total, guarded against division by zero. */
function recallScore(matched: number, total: number): number {
  if (total === 0) return 1;
  return matched / total;
}

/**
 * Decline forms that are not plain phrases. Each names a source (documents, notes, papers, the
 * report) or a stated absence, so a technical negation about the subject ("the study did not
 * include children") does not match.
 */
const DECLINE_PATTERNS: RegExp[] = [
  /\bdo(?:es)?(?:n't|\s+not)\s+provide\s+(?:any\s+)?information\b/,
  /\bnot\s+covered\s+in\s+(?:your|the|these|the\s+selected)\s+(?:documents|sources|notes|papers)\b/,
  /\b(?:sources|notes|papers|documents|report|passages)\s+(?:do|does)(?:n't|\s+not)\s+(?:cover|mention|discuss|contain|address|include)\b/,
  /\b(?:there\s+is\s+)?no\s+mention\s+of\b/,
  /\bi\s+don't\s+see\s+any\s+information\b/,
  /\bnot\s+(?:mentioned|discussed|addressed)\s+in\b/,
];

/** Check whether the answer text exhibits abstention language. */
function answerAbstains(answer: string): boolean {
  // Models write curly apostrophes and quotes; match them as straight ones.
  const text = answer
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„]/g, '"')
    .toLowerCase();
  // Phrases must be specific enough not to fire on legitimate negations in source-backed
  // technical prose (e.g. "points do not have enough neighbours").
  const phraseSignals = [
    "cannot find",
    "can't find",
    "couldn't find",
    "not found in the",
    "not found in your",
    "no information in the",
    "no information in these",
    "not covered in the",
    "not covered in these",
    "does not contain information",
    "doesn't contain information",
    "i'm unable to",
    "i am unable to",
    "i don't have access",
    "i do not have access",
    "unable to answer",
    "based on the retrieved passages, i cannot",
    "based on what's available, i cannot",
  ];
  if (phraseSignals.some((s) => text.includes(s))) return true;
  if (/\bi'?(?:m|am) not able to\b/.test(text)) return true;
  return DECLINE_PATTERNS.some((pattern) => pattern.test(text));
}

/** Recall of expected items within a set of chunks (checks all chunk content). */
function chunkRecall(
  chunks: Array<{ content: string }>,
  items: string[]
): { matched: string[]; unmatched: string[]; score: number } {
  const combinedText = chunks.map((c) => c.content).join("\n");
  const { matched, unmatched } = countMatches(combinedText, items);
  return { matched, unmatched, score: recallScore(matched.length, items.length) };
}

// ─── 1. Expected Item Recall ────────────────────────────────────

/**
 * Checks how many required items appear in the answer text using
 * case-insensitive substring matching.
 *
 * Score = matched / total
 * Status: pass >= 0.9, warn >= 0.7, fail otherwise.
 */
export function expectedItemRecall(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (artifact.retrievalOnly) {
    return metricResult(
      "expected_item_recall",
      fixture,
      artifact,
      "info",
      0,
      "retrieval-only run: no answer was generated, so answer recall is not scored."
    );
  }
  if (fixture.expectedItems.length === 0) {
    return metricResult(
      "expected_item_recall",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — recall checked via expectedAnswer / LLM judge only.",
      { matched: [], unmatched: [] }
    );
  }
  const { matched, unmatched } = countMatches(artifact.answer, fixture.expectedItems);
  const score = recallScore(matched.length, fixture.expectedItems.length);

  let status: MetricStatus;
  if (score >= 0.9) status = "pass";
  else if (score >= 0.7) status = "warn";
  else status = "fail";

  const detail =
    unmatched.length === 0
      ? `All ${matched.length} expected items found in answer.`
      : `Found ${matched.length}/${fixture.expectedItems.length} expected items. Missing: ${unmatched.join(", ")}`;

  return metricResult("expected_item_recall", fixture, artifact, status, score, detail, {
    matched,
    unmatched,
  });
}

// ─── 2. Retrieval Item Recall ───────────────────────────────────

/**
 * Checks how many required items appear in raw retrieved chunks at three
 * stages: pre-rerank, post-rerank, selected.
 *
 * Returns 3 MetricResults (one per stage).
 * Score = matched/total for each stage.
 */
export function retrievalItemRecall(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult[] {
  const stages: Array<{
    label: string;
    metric: string;
    chunks: Array<{ content: string }>;
  }> = [
    {
      label: "pre-rerank",
      metric: "retrieval_item_recall_pre_rerank",
      chunks: artifact.preRerankChunks,
    },
    {
      label: "post-rerank",
      metric: "retrieval_item_recall_post_rerank",
      chunks: artifact.postRerankChunks,
    },
    {
      label: "selected",
      metric: "retrieval_item_recall_selected",
      chunks: artifact.selectedChunks,
    },
  ];

  return stages.map(({ label, metric, chunks }) => {
    const { matched, unmatched, score } = chunkRecall(chunks, fixture.expectedItems);

    const detail =
      unmatched.length === 0
        ? `All ${matched.length} expected items found at ${label} stage (${chunks.length} chunks).`
        : `Found ${matched.length}/${fixture.expectedItems.length} at ${label} stage. Missing: ${unmatched.join(", ")}`;

    return metricResult(metric, fixture, artifact, "info", score, detail, {
      stage: label,
      matched,
      unmatched,
      chunkCount: chunks.length,
    });
  });
}

// ─── Retrieval ran and reached the answer ──────────────────────

/**
 * Fails a notebook-searching chat case whose answer drew on no passages, or where any sub-query
 * search failed (threw or timed out). Without it a case with no expected items passed every
 * deterministic metric even when its sources were never searched.
 */
export function retrievalNonEmpty(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const metric = "retrieval_nonempty";
  if (fixture.sourcePolicy && !fixture.sourcePolicy.channels.includes("notebook")) {
    return metricResult(
      metric,
      fixture,
      artifact,
      "info",
      1,
      "Notebook not searched in this case."
    );
  }
  const failed = artifact.failedSubQueries ?? [];
  if (failed.length > 0) {
    const searches = Math.max(artifact.subQueries.length, failed.length);
    return metricResult(
      metric,
      fixture,
      artifact,
      "fail",
      0,
      `${failed.length} of ${searches} sub-query searches failed: ${failed.join("; ")}`,
      { failedSubQueries: failed, selectedChunks: artifact.selectedChunks.length }
    );
  }
  if (artifact.subQueries.length === 0) {
    // Clarifying questions and direct replies (greetings, app questions) search nothing by design.
    return metricResult(metric, fixture, artifact, "info", 1, "No source search ran this turn.");
  }
  if (artifact.selectedChunks.length === 0) {
    return metricResult(
      metric,
      fixture,
      artifact,
      "fail",
      0,
      "No passages reached the answer; it was written without the sources."
    );
  }
  return metricResult(
    metric,
    fixture,
    artifact,
    "pass",
    1,
    `${artifact.selectedChunks.length} passages reached the answer.`
  );
}

// ─── 3. Retrieval Precision @ K ────────────────────────────────

/**
 * Relevant selected chunks / total selected chunks.
 * A chunk is "relevant" if it contains at least one expected item.
 *
 * Score = relevant / total
 * Status: pass >= 0.5, warn >= 0.3, fail otherwise.
 */
export function retrievalPrecisionAtK(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectedItems.length === 0) {
    return metricResult(
      "retrieval_precision_at_k",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — precision@K not applicable."
    );
  }
  const total = artifact.selectedChunks.length;
  if (total === 0) {
    return metricResult(
      "retrieval_precision_at_k",
      fixture,
      artifact,
      "fail",
      0,
      "No chunks selected; precision undefined."
    );
  }

  let relevant = 0;
  const chunkRelevance: Array<{ id: string; relevant: boolean; matchedItems: string[] }> = [];
  for (const chunk of artifact.selectedChunks) {
    const { matched } = countMatches(chunk.content, fixture.expectedItems);
    const isRelevant = matched.length > 0;
    if (isRelevant) relevant++;
    chunkRelevance.push({ id: chunk.id, relevant: isRelevant, matchedItems: matched });
  }

  const score = relevant / total;

  let status: MetricStatus;
  if (score >= 0.5) status = "pass";
  else if (score >= 0.3) status = "warn";
  else status = "fail";

  return metricResult(
    "retrieval_precision_at_k",
    fixture,
    artifact,
    status,
    score,
    `${relevant}/${total} selected chunks are relevant (contain at least one expected item).`,
    { relevant, total, chunkRelevance }
  );
}

// ─── 4. Retrieval nDCG @ K ──────────────────────────────────────

/**
 * Simplified nDCG@K where relevance is binary (chunk contains at least one
 * expected item).
 *
 * DCG  = sum( rel_i / log2(i + 1) )   for i = 1..K (1-indexed)
 * IDCG = ideal DCG (all relevant chunks ranked first)
 * Score = DCG / IDCG. If IDCG = 0, score = 0.
 */
export function retrievalNdcgAtK(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectedItems.length === 0) {
    return metricResult(
      "retrieval_ndcg_at_k",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — nDCG not applicable."
    );
  }
  const chunks = artifact.selectedChunks;
  const k = chunks.length;

  if (k === 0) {
    return metricResult(
      "retrieval_ndcg_at_k",
      fixture,
      artifact,
      "fail",
      0,
      "No chunks selected; nDCG undefined."
    );
  }

  // Binary relevance for each chunk at its current rank.
  const relevance: number[] = chunks.map((chunk) => {
    const { matched } = countMatches(chunk.content, fixture.expectedItems);
    return matched.length > 0 ? 1 : 0;
  });

  // DCG = sum( rel_i / log2(i + 1) ), i is 1-indexed rank
  let dcg = 0;
  for (let i = 0; i < k; i++) {
    dcg += relevance[i] / Math.log2(i + 2); // i+2 because log2(1+1)=1 for rank 1
  }

  // IDCG: sort relevance descending, compute DCG of ideal ranking
  const sortedRel = [...relevance].sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < k; i++) {
    idcg += sortedRel[i] / Math.log2(i + 2);
  }

  const score = idcg === 0 ? 0 : dcg / idcg;

  let status: MetricStatus;
  if (score >= 0.7) status = "pass";
  else if (score >= 0.4) status = "warn";
  else status = "fail";

  const relevantCount = relevance.filter((r) => r === 1).length;

  return metricResult(
    "retrieval_ndcg_at_k",
    fixture,
    artifact,
    status,
    score,
    `nDCG@${k} = ${score.toFixed(3)} (${relevantCount}/${k} relevant chunks).`,
    {
      k,
      dcg: Math.round(dcg * 1000) / 1000,
      idcg: Math.round(idcg * 1000) / 1000,
      relevantCount,
      relevance,
    }
  );
}

// ─── 5. Abstention Correctness ──────────────────────────────────

/** Item-mode recall needed to count a stage as holding the context (unchanged). */
const ITEM_SUFFICIENT_RECALL = 0.7;
/** Passage-mode recall needed to count a stage as holding the context (see abstentionCorrectness). */
const PASSAGE_SUFFICIENT_RECALL = 0.6;
/** Passage mode: a selected-stage miss at or above this is a warn, below it a fail. */
const PASSAGE_PARTIAL_SELECTED_RECALL = 0.5;

/**
 * Unanswerable fixtures (`expectAbstain`): the sources lack the answer, so declining is correct and
 * any answer that does not abstain is hallucination under pressure. Item and passage rules do not
 * apply, since there are no expected items to recall.
 */
function unanswerableAbstention(fixture: EvalFixture, artifact: EvalRunArtifact): MetricResult {
  if (answerAbstains(artifact.answer)) {
    return metricResult(
      "abstention_correctness",
      fixture,
      artifact,
      "pass",
      1,
      "Answer declines: the sources do not contain the answer.",
      { category: "correct_abstention", abstains: true }
    );
  }
  return metricResult(
    "abstention_correctness",
    fixture,
    artifact,
    "fail",
    0,
    "Answer does not decline although the sources do not contain the answer.",
    { category: "hallucination_under_pressure", abstains: false }
  );
}

/**
 * Thresholds. Item mode: "sufficient" is 0.7. Passage mode is looser: with 2 or 3 passages, 0.7
 * would mean every passage, so losing one of three would fail. Passage mode uses 0.6 for
 * sufficient, and 0.5 as the floor below which a context-selection miss is a fail rather than a
 * warn.
 *
 * Deterministic routing rule (sufficient = the mode's sufficient threshold):
 * - If selected-context recall >= sufficient and the answer abstains with answer recall < 0.5:
 *   "answer_generation" error, fail. An answer with recall >= 0.5 has answered, so a decline
 *   fragment about its missing items falls through to the rules below.
 * - If raw or post-rerank recall >= sufficient but selected-context recall < sufficient:
 *   "context_selection" miss. Fail; in passage mode, warn when selected recall is >= 0.5.
 * - If all snapshots < sufficient: "retrieval_coverage" miss, warn.
 * - If answer provides items and recall >= sufficient: pass.
 */
export function abstentionCorrectness(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  if (fixture.expectAbstain === true) {
    return unanswerableAbstention(fixture, artifact);
  }
  // Without expectedItems, the same rules run on gold passages when the fixture has them (D1).
  const passageMode =
    fixture.expectedItems.length === 0 && (fixture.expectedPassages?.length ?? 0) > 0;
  if (fixture.expectedItems.length === 0 && !passageMode) {
    return metricResult(
      "abstention_correctness",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — abstention vs retrieval not scored deterministically.",
      { category: "none" }
    );
  }
  const unit = passageMode ? "passages" : "items";
  const { selectedRecall, preRerankRecall, postRerankRecall, answerRecall } = passageMode
    ? passageAbstentionRecalls(fixture, artifact)
    : {
        selectedRecall: chunkRecall(artifact.selectedChunks, fixture.expectedItems).score,
        preRerankRecall: chunkRecall(artifact.preRerankChunks, fixture.expectedItems).score,
        postRerankRecall: chunkRecall(artifact.postRerankChunks, fixture.expectedItems).score,
        answerRecall: recallScore(
          countMatches(artifact.answer, fixture.expectedItems).matched.length,
          fixture.expectedItems.length
        ),
      };

  const abstains = answerAbstains(artifact.answer);
  const sufficient = passageMode ? PASSAGE_SUFFICIENT_RECALL : ITEM_SUFFICIENT_RECALL;

  // Rule 1: Sufficient context was selected but the answer abstained without giving the items.
  // An answer that lists at least half of them has answered; a decline fragment about the rest
  // ("the notes do not mention the fifth") does not make it a wrongful abstention.
  if (selectedRecall >= sufficient && abstains && answerRecall < 0.5) {
    return metricResult(
      "abstention_correctness",
      fixture,
      artifact,
      "fail",
      selectedRecall,
      `Answer abstains despite sufficient context (selected recall >= ${sufficient}). Answer generation error.`,
      {
        category: "answer_generation",
        selectedRecall,
        preRerankRecall,
        postRerankRecall,
        answerRecall,
        abstains: true,
      }
    );
  }

  // Rule 2: Pre-rerank or post-rerank had items, but context selection dropped them.
  if (
    (preRerankRecall >= sufficient || postRerankRecall >= sufficient) &&
    selectedRecall < sufficient
  ) {
    const status: MetricStatus =
      passageMode && selectedRecall >= PASSAGE_PARTIAL_SELECTED_RECALL ? "warn" : "fail";
    return metricResult(
      "abstention_correctness",
      fixture,
      artifact,
      status,
      selectedRecall,
      `Relevant ${unit} existed pre-selection but were dropped. Context selection miss.`,
      {
        category: "context_selection",
        selectedRecall,
        preRerankRecall,
        postRerankRecall,
        answerRecall,
        abstains,
      }
    );
  }

  // Rule 3: Retrieval never found the items.
  if (
    selectedRecall < sufficient &&
    preRerankRecall < sufficient &&
    postRerankRecall < sufficient
  ) {
    return metricResult(
      "abstention_correctness",
      fixture,
      artifact,
      "warn",
      Math.max(selectedRecall, preRerankRecall, postRerankRecall),
      `Retrieval could not find expected ${unit} across any stage. Retrieval coverage miss.`,
      {
        category: "retrieval_coverage",
        selectedRecall,
        preRerankRecall,
        postRerankRecall,
        answerRecall,
        abstains,
      }
    );
  }

  // Rule 4: Answer provides items and recall is sufficient.
  return metricResult(
    "abstention_correctness",
    fixture,
    artifact,
    "pass",
    selectedRecall,
    `Answer provides expected ${unit} with sufficient recall.`,
    {
      category: "none",
      selectedRecall,
      preRerankRecall,
      postRerankRecall,
      answerRecall,
      abstains: false,
    }
  );
}

// ─── 6. Citation Validity ───────────────────────────────────────

/**
 * Checks that citations in the answer reference chunks that actually exist
 * in selected chunks.
 *
 * Score = valid_citations / total_citations.
 * Status: pass >= 0.8, warn >= 0.5, fail otherwise.
 * If no citations and expectedBehavior says to cite: fail with score 0.
 */
export function citationValidity(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const selectedChunkIds = new Set(artifact.selectedChunks.map((c) => c.id));
  const citations = artifact.citations;
  // Word-boundary cues only — avoid false positives (e.g. "resources" contains "source").
  // A decline has nothing to cite, even when its expectedBehavior names the sources.
  const expectsCitation =
    fixture.expectAbstain !== true &&
    /\bcitations?\b|\breferences?\b|\bsources?\b|inline\s+citation/i.test(fixture.expectedBehavior);

  // No citations found in the answer.
  if (citations.length === 0) {
    if (expectsCitation) {
      return metricResult(
        "citation_validity",
        fixture,
        artifact,
        "fail",
        0,
        "No citations found in answer, but expectedBehavior requires citations.",
        { totalCitations: 0, validCitations: 0, expectsCitation: true }
      );
    }
    // No citations required, neutral pass.
    return metricResult(
      "citation_validity",
      fixture,
      artifact,
      "pass",
      1,
      "No citations in answer and none expected.",
      { totalCitations: 0, validCitations: 0, expectsCitation: false }
    );
  }

  let valid = 0;
  const citationDetails: Array<{ citation: string; valid: boolean }> = [];
  for (const citation of citations) {
    // A citation is valid if it matches a chunk id in the selected set.
    const isValid = selectedChunkIds.has(citation);
    if (isValid) valid++;
    citationDetails.push({ citation, valid: isValid });
  }

  const score = valid / citations.length;

  let status: MetricStatus;
  if (score >= 0.8) status = "pass";
  else if (score >= 0.5) status = "warn";
  else status = "fail";

  return metricResult(
    "citation_validity",
    fixture,
    artifact,
    status,
    score,
    `${valid}/${citations.length} citations reference valid selected chunks.`,
    { totalCitations: citations.length, validCitations: valid, citationDetails }
  );
}

// ─── 7. Latency / Cost Budget ──────────────────────────────────

/** Static fallback gates when no baseline file is available. */
/**
 * End-to-end chat can include HyDE, multi-subquery retrieval, rerank, and long structured answers.
 * Without a baseline, use a generous ceiling so latency reflects product behavior, not harness noise.
 *
 * Studio kinds run map-reduce over an entire notebook (and audio adds TTS on top), so their
 * inherent latency floors are well above chat. The gate per runner reflects observed steady-state
 * cost so a healthy run reads "pass", not "fail-by-design".
 */
const DEFAULT_LATENCY_MS_GATE = 60000;
const PER_RUNNER_LATENCY_MS_GATE: Record<string, number> = {
  chat: 60000,
  research: 120000,
  both: 120000,
  report: 90000,
  flashcards: 90000,
  quiz: 90000,
  mindmap: 90000,
  infographic: 300000,
  spreadsheet: 90000,
  writtenQuestions: 90000,
  audioScript: 240000,
};
const PER_RUNNER_TOKEN_GATE: Record<string, number> = {
  chat: 8000,
  research: 20000,
  both: 20000,
  report: 25000,
  flashcards: 20000,
  quiz: 20000,
  mindmap: 20000,
  infographic: 15000,
  spreadsheet: 20000,
  writtenQuestions: 20000,
  audioScript: 15000,
  audioScriptOnly: 8000,
  literatureReview: 30000,
};

/**
 * Checks latency and token cost against a baseline or static gates.
 *
 * If a baseline is provided: pass if within 1.2x, warn if within 2x, fail otherwise.
 * If no baseline: pass if within per-runner latency and token gates, warn if within 2x, fail otherwise.
 */
export function latencyCostBudget(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline
): MetricResult {
  const latencyMs = artifact.latencyMs;
  const totalTokens = artifact.tokenUsage?.total ?? 0;
  // Estimated usage (chars/4) is not a provider count, so tokens are reported but never gated.
  const providerTokens = artifact.tokenUsageSource === "provider";

  if (baseline && artifact.retrievalOnly) {
    // A retrieval-only run times retrieval alone; a full-run baseline would always look like a fail.
    return metricResult(
      "latency_cost_budget",
      fixture,
      artifact,
      "info",
      1,
      "retrieval-only: not compared to a full-run baseline",
      { latencyMs, totalTokens, retrievalOnly: true }
    );
  }

  if (baseline) {
    const latencyRatio = latencyMs / baseline.latencyMs;
    const baselineTokens = baseline.tokenUsage.total;
    // A baseline with no recorded usage has no ratio to compare against.
    const tokensGated = providerTokens && baselineTokens > 0;
    const tokenRatio = baselineTokens > 0 ? totalTokens / baselineTokens : 0;
    const worstRatio = tokensGated ? Math.max(latencyRatio, tokenRatio) : latencyRatio;

    let status: MetricStatus;
    if (worstRatio <= 1.2) status = "pass";
    else if (worstRatio <= 2.0) status = "warn";
    else status = "fail";

    const latencyPart = `Latency ${latencyMs}ms (baseline ${baseline.latencyMs}ms, ${latencyRatio.toFixed(2)}x), `;
    const tokenPart = !providerTokens
      ? `tokens ${totalTokens} (estimated, not gated)`
      : tokensGated
        ? `tokens ${totalTokens} (baseline ${baselineTokens}, ${tokenRatio.toFixed(2)}x).`
        : `tokens ${totalTokens} (baseline has no token usage)`;

    return metricResult(
      "latency_cost_budget",
      fixture,
      artifact,
      status,
      worstRatio,
      `${latencyPart}${tokenPart}`,
      {
        latencyMs,
        totalTokens,
        latencyRatio: Math.round(latencyRatio * 100) / 100,
        ...(tokensGated ? { tokenRatio: Math.round(tokenRatio * 100) / 100 } : {}),
        baselineLatencyMs: baseline.latencyMs,
        baselineTotalTokens: baselineTokens,
        tokensGated,
        ...(artifact.callCounters ? { callCounters: artifact.callCounters } : {}),
      }
    );
  }

  // No baseline: use static gates (per-runner where defined).
  const latencyGate = PER_RUNNER_LATENCY_MS_GATE[artifact.runner] ?? DEFAULT_LATENCY_MS_GATE;
  const tokenGate = PER_RUNNER_TOKEN_GATE[artifact.runner] ?? 8000;
  const latencyOk = latencyMs <= latencyGate;
  const tokensOk = !providerTokens || totalTokens <= tokenGate;
  const withinWarnBand =
    latencyMs <= latencyGate * 2 && (!providerTokens || totalTokens <= tokenGate * 2);

  let status: MetricStatus;
  if (latencyOk && tokensOk) status = "pass";
  else if (withinWarnBand) status = "warn";
  else status = "fail";

  const score = latencyOk && tokensOk ? 1 : withinWarnBand ? 0.5 : 0;

  const detail = providerTokens
    ? `Latency ${latencyMs}ms (gate ${latencyGate}ms), tokens ${totalTokens} (gate ${tokenGate}). No baseline.`
    : `Latency ${latencyMs}ms (gate ${latencyGate}ms), no baseline, tokens ${totalTokens} (estimated, not gated)`;

  return metricResult("latency_cost_budget", fixture, artifact, status, score, detail, {
    latencyMs,
    totalTokens,
    latencyGate,
    tokenGate,
    latencyOk,
    tokensOk,
    hasBaseline: false,
    tokensGated: providerTokens,
    ...(artifact.callCounters ? { callCounters: artifact.callCounters } : {}),
  });
}

// Re-export types for convenience
export type { EvalBaseline };
