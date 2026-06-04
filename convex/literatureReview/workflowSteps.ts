import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { v } from "convex/values";
import { allWithConcurrency } from "../_agents/_shared/concurrency.js";
import { createLLM } from "../_agents/_shared/llm_factory.js";
import { invokeWithHttpRetry } from "../_agents/_shared/retry.js";
import { invokeWithTimeout } from "../_agents/_shared/timeout.js";
import { cachedRerank } from "../_agents/chat/rerankCache.js";
import {
  BENCHMARK_RELIABILITY_SUGGESTED_COLUMNS,
  isBenchmarkReliabilityQuestion,
  isLegacyGenericColumnSet,
  PLAN_REVIEW_COLUMN_RETRY_APPENDIX,
} from "../_agents/literature_review/planReviewColumns.js";
import {
  EXTRACT_DATA_PROMPT,
  EXTRACT_DATA_SYSTEM_PROMPT,
  ExtractDataOutputSchema,
  GENERATE_FULL_REPORT_PROMPT,
  GENERATE_FULL_REPORT_SYSTEM_PROMPT,
  GENERATE_REPORT_SECTION_PROMPT,
  GENERATE_REPORT_SECTION_SYSTEM_PROMPT,
  GenerateFullReportOutputSchema,
  PLAN_REVIEW_PROMPT,
  PLAN_REVIEW_SYSTEM_PROMPT,
  PlanReviewOutputSchema,
  SCREEN_PAPERS_SYSTEM_PROMPT,
  SCREEN_SINGLE_PAPER_PROMPT,
  ScreenSinglePaperOutputSchema,
} from "../_agents/literature_review/prompts.js";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { ARXIV_MIN_INTERVAL_MS } from "../_lib/arxivThrottle.js";
import { env } from "../_lib/env.js";
import { createServiceLogger } from "../_lib/logging/serviceLogger.js";
import { resolveSmartModel } from "../_lib/resolveSmartModel.js";
import {
  literatureSearchOptionsValidator,
  sourcesForResearchDatabase,
} from "../_model/literatureReviewSearchOptions.js";
import {
  type AcademicSearchCacheResult,
  normalizePublicationYear,
  searchCache,
} from "../_services/search/AcademicSearchService.js";
import { generateCitationKey } from "../_utils/CitationEngine.js";
import { EXTRACT_DATA_CHUNK_SIZE, SCREEN_PAPERS_BATCH_SIZE } from "./batchSizes.js";
import {
  bulkLlmModel,
  LITERATURE_BULK_LLM_CONCURRENCY,
  truncateForLiteratureLlm,
} from "./llmTuning.js";
import {
  compactPapersForSnapshot,
  compactPapersForWorkflow,
  compactRankedPapersForWorkflow,
} from "./rankedPapersSnapshot.js";
import {
  buildGroundedNumericSet,
  buildPrismaMethodsBlock,
  buildStudyCharacteristicsTable,
  getReportSectionsNeedingRegeneration,
  isTrivialReportSectionContent,
  mergeDeterministicReportSections,
  type ReportPaperRow,
  validateAndSanitizeReportSections,
} from "./reportContext.js";
import {
  fallbackReviewTitleFromQuery,
  literatureReportTitle,
  normalizeReviewTitle,
} from "./titles.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Per-paper LLM ceiling (fast model; fail fast → metadata / conservative fallback). */
const EXTRACT_DATA_PER_PAPER_TIMEOUT_MS = 90_000;

const SCREEN_SINGLE_PAPER_TIMEOUT_MS = 45_000;

export { EXTRACT_DATA_CHUNK_SIZE } from "./batchSizes.js";

const literaturePaperFields = {
  title: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  abstract: v.string(),
  url: v.string(),
  pdfUrl: v.optional(v.string()),
  source: v.union(
    v.literal("openalex"),
    v.literal("arxiv"),
    v.literal("semantic_scholar"),
    v.literal("pubmed")
  ),
  citationCount: v.optional(v.number()),
  doi: v.optional(v.string()),
  score: v.number(),
  isIncluded: v.optional(v.boolean()),
  includeReason: v.optional(v.string()),
  extractedData: v.optional(v.record(v.string(), v.string())),
};

const literaturePaperValidator = v.object(literaturePaperFields);

const confirmedColumnValidator = v.object({
  id: v.string(),
  name: v.string(),
  instructions: v.optional(v.string()),
  isVisible: v.boolean(),
});

export function dedupePapers<T extends { doi?: string; title: string; authors: string[] }>(
  papers: T[]
): T[] {
  const seenDoi = new Set<string>();
  const seenTitle = new Set<string>();
  const out: T[] = [];
  for (const p of papers) {
    const doiKey = p.doi?.toLowerCase().trim();
    if (doiKey) {
      if (seenDoi.has(doiKey)) continue;
      seenDoi.add(doiKey);
      out.push(p);
      continue;
    }
    const first = p.authors[0]?.split(",")[0]?.trim().toLowerCase() ?? "";
    const titleKey = `${p.title.toLowerCase().trim()}|${first}`;
    if (seenTitle.has(titleKey)) continue;
    seenTitle.add(titleKey);
    out.push(p);
  }
  return out;
}

function mapModelForLiteratureReview(smartModel?: string): string {
  return resolveSmartModel(smartModel);
}

export async function planReviewHandler(
  _ctx: ActionCtx,
  args: { query: string; smartModel?: string }
) {
  const q = args.query.trim();
  if (q.length === 0) {
    return { reviewTitle: "Literature Review", searchQueries: [], suggestedColumns: [] };
  }

  const logger = createServiceLogger("literatureReview", "planReview");

  try {
    const llm = createLLM({
      apiKey: env.TOGETHER_AI_API_KEY,
      mapModel: mapModelForLiteratureReview(args.smartModel),
      temperatures: 0.3,
      maxTokens: 2000,
      phase: "smart",
    });

    const structuredLlm = llm.withStructuredOutput(PlanReviewOutputSchema, {
      name: "plan_review",
    });

    const basePrompt = PLAN_REVIEW_PROMPT.replace(/{query}/g, args.query);

    const invokePlanReview = (humanPrompt: string) =>
      invokeWithHttpRetry(
        () =>
          structuredLlm.invoke([
            new SystemMessage(PLAN_REVIEW_SYSTEM_PROMPT),
            new HumanMessage(humanPrompt),
          ]),
        "planReview"
      );

    let response = await invokePlanReview(basePrompt);

    if (isLegacyGenericColumnSet(response.suggestedColumns)) {
      logger.warn("planReview returned legacy generic columns; retrying with tailored prompt");
      response = await invokePlanReview(basePrompt + PLAN_REVIEW_COLUMN_RETRY_APPENDIX);
    }

    if (isLegacyGenericColumnSet(response.suggestedColumns) && isBenchmarkReliabilityQuestion(q)) {
      logger.warn("Using benchmark-reliability fallback columns after generic retry");
      response = {
        ...response,
        suggestedColumns: BENCHMARK_RELIABILITY_SUGGESTED_COLUMNS.map((c) => ({
          id: c.id,
          name: c.name ?? c.id,
          instructions: `Extract ${c.name ?? c.id} for benchmark-to-deployment predictive validity.`,
          isVisible: true,
        })),
      };
    }

    return {
      reviewTitle: normalizeReviewTitle(
        response.reviewTitle?.trim() || fallbackReviewTitleFromQuery(q)
      ),
      searchQueries: response.searchQueries,
      suggestedColumns: response.suggestedColumns,
    };
  } catch (error) {
    logger.error("LLM call failed", error);
    return {
      reviewTitle: fallbackReviewTitleFromQuery(q),
      searchQueries: [q],
      suggestedColumns: [],
    };
  }
}

export const planReview = internalAction({
  args: { query: v.string(), smartModel: v.optional(v.string()) },
  returns: v.object({
    reviewTitle: v.string(),
    searchQueries: v.array(v.string()),
    suggestedColumns: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
        isVisible: v.boolean(),
      })
    ),
  }),
  handler: planReviewHandler,
});

export async function searchPapersHandler(
  ctx: ActionCtx,
  args: {
    query: string;
    searchQueries: string[];
    searchOptions?: {
      researchDatabase: "all" | "pubmed" | "arxiv";
      academicFilters?: {
        publicationYearFrom?: number;
        publicationYearTo?: number;
        minCitations?: number;
        openAccessOnly?: boolean;
        hasFullText?: boolean;
        fieldOfStudyTerms?: string[];
      };
    };
  },
  fetchPapers?: (
    ctx: ActionCtx,
    query: string,
    maxResults: number,
    searchOptions?: typeof args.searchOptions
  ) => Promise<AcademicSearchCacheResult>
) {
  const queries = args.searchQueries.length > 0 ? args.searchQueries : [args.query];
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  let rateLimited = false;
  const merged: Array<{
    title: string;
    authors: string[];
    year?: number;
    abstract: string;
    url: string;
    pdfUrl?: string;
    source: "openalex" | "arxiv" | "semantic_scholar" | "pubmed";
    citationCount?: number;
    doi?: string;
    score: number;
  }> = [];

  const doFetch =
    fetchPapers ??
    ((c: ActionCtx, q: string, m: number, opts?: typeof args.searchOptions) => {
      const af = opts?.academicFilters;
      const sources = opts ? sourcesForResearchDatabase(opts.researchDatabase) : undefined;
      return searchCache.fetch(c, {
        query: q,
        maxResults: m,
        sortBy: "relevance",
        sources,
        ...(af?.publicationYearFrom != null ? { publicationYearFrom: af.publicationYearFrom } : {}),
        ...(af?.publicationYearTo != null ? { publicationYearTo: af.publicationYearTo } : {}),
        ...(af?.minCitations != null ? { minCitations: af.minCitations } : {}),
        ...(af?.openAccessOnly ? { openAccessOnly: true } : {}),
        ...(af?.hasFullText ? { hasFullText: true } : {}),
        ...(af?.fieldOfStudyTerms?.length ? { fieldOfStudyTerms: af.fieldOfStudyTerms } : {}),
      });
    });

  // Serialize queries so arXiv global throttle (1 req / 3.5s) is not burst by parallel cache misses
  const batches: Awaited<ReturnType<typeof doFetch>>[] = [];
  for (let i = 0; i < unique.length; i++) {
    batches.push(await doFetch(ctx, unique[i], 50, args.searchOptions));
    if (i < unique.length - 1) {
      await delay(ARXIV_MIN_INTERVAL_MS);
    }
  }
  for (const batch of batches) {
    if (batch.rateLimited) rateLimited = true;
    for (const p of batch.papers) {
      merged.push({
        title: p.title,
        authors: p.authors,
        year: normalizePublicationYear(p.year),
        abstract: p.abstract,
        url: p.url,
        pdfUrl: p.pdfUrl,
        source: p.source,
        citationCount: p.citationCount,
        doi: p.doi,
        score: p.score,
      });
    }
  }

  const recordsIdentified = merged.length;
  const deduped = dedupePapers(merged);
  return {
    papers: compactPapersForWorkflow(deduped),
    recordsIdentified,
    recordsAfterDedupe: deduped.length,
    rateLimited,
  };
}

export const searchPapers = internalAction({
  args: {
    query: v.string(),
    searchQueries: v.array(v.string()),
    searchOptions: v.optional(literatureSearchOptionsValidator),
  },
  returns: v.object({
    papers: v.array(literaturePaperValidator),
    recordsIdentified: v.number(),
    recordsAfterDedupe: v.number(),
    rateLimited: v.boolean(),
  }),
  handler: searchPapersHandler,
});

export async function deduplicatePapersHandler(_ctx: ActionCtx, args: { papers: any[] }) {
  return { papers: compactPapersForWorkflow(dedupePapers(args.papers)) };
}

export const deduplicatePapers = internalAction({
  args: { papers: v.array(literaturePaperValidator) },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: deduplicatePapersHandler,
});

export async function rankPapersHandler(ctx: ActionCtx, args: { papers: any[]; query: string }) {
  const logger = createServiceLogger("literatureReview", "rankPapers");

  if (args.papers.length === 0) {
    return { papers: [] };
  }

  try {
    const documents = args.papers.map((p, i) => ({
      id: String(i),
      content: `${p.title}\n\n${p.abstract}`,
    }));

    logger.info("Starting ZeroEntropy reranking", {
      paperCount: args.papers.length,
      query: args.query.slice(0, 100),
    });

    const reranked = await cachedRerank(ctx, args.query, documents, "zerank-2", 30);

    const scoreMap = new Map(
      reranked.map((r, i) => [r.id, { score: r.score ?? 30 - i, index: i }])
    );

    const sorted = [...args.papers]
      .map((p, i) => ({
        ...p,
        score: scoreMap.get(String(i))?.score ?? p.score,
      }))
      .sort((a, b) => b.score - a.score);

    const compacted = compactRankedPapersForWorkflow(sorted);
    logger.info("Reranking complete", {
      paperCount: sorted.length,
      snapshotCount: compacted.length,
      topScore: sorted[0]?.score,
    });

    return { papers: compacted };
  } catch (error) {
    logger.error("Reranking failed, falling back to original scores", error, {
      paperCount: args.papers.length,
    });
    const sorted = [...args.papers].sort((a, b) => b.score - a.score);
    return { papers: compactRankedPapersForWorkflow(sorted) };
  }
}

export const rankPapers = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    query: v.string(),
  },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: rankPapersHandler,
});

function conservativeScreeningDecisions(
  batchStartIndex: number,
  batchLength: number
): Array<{ paperIndex: number; isIncluded: boolean; reason: string }> {
  const reason = "Included by conservative fallback due to screening error.";
  return Array.from({ length: batchLength }, (_, j) => ({
    paperIndex: batchStartIndex + j,
    isIncluded: true,
    reason,
  }));
}

async function screenOnePaperWithLlm(
  paper: { title: string; abstract: string },
  query: string
): Promise<{ isIncluded: boolean; reason: string }> {
  const llm = createLLM({
    apiKey: env.TOGETHER_AI_API_KEY,
    mapModel: bulkLlmModel(),
    temperatures: 0.2,
    maxTokens: 256,
    phase: "fast",
  });

  const structuredLlm = llm.withStructuredOutput(ScreenSinglePaperOutputSchema, {
    name: "screen_single_paper",
  });

  const prompt = SCREEN_SINGLE_PAPER_PROMPT.replace(/{query}/g, query)
    .replace(/{title}/g, paper.title)
    .replace(/{abstract}/g, truncateForLiteratureLlm(paper.abstract));

  const response = await invokeWithHttpRetry(
    () =>
      invokeWithTimeout(
        () =>
          structuredLlm.invoke([
            new SystemMessage(SCREEN_PAPERS_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ]),
        SCREEN_SINGLE_PAPER_TIMEOUT_MS,
        "screenPapers"
      ),
    "screenPapers"
  );

  return { isIncluded: response.isIncluded, reason: response.reason };
}

/** Screens up to five papers per action (parallel per-paper LLM calls). */
export async function screenPapersBatchHandler(
  _ctx: ActionCtx,
  args: {
    papers: any[];
    query: string;
    batchStartIndex: number;
    smartModel?: string;
  }
) {
  const logger = createServiceLogger("literatureReview", "screenPapersBatch");
  const batchLength = args.papers.length;
  logger.info("Screening batch", {
    batchStartIndex: args.batchStartIndex,
    paperCount: batchLength,
  });

  if (batchLength === 0) {
    return { decisions: [] as Array<{ paperIndex: number; isIncluded: boolean; reason: string }> };
  }

  const fallbackReason = "Included by conservative fallback due to screening error.";
  const decisions = await allWithConcurrency(
    args.papers.map((paper, localIndex) => async () => {
      const paperIndex = args.batchStartIndex + localIndex;
      try {
        const { isIncluded, reason } = await screenOnePaperWithLlm(paper, args.query);
        return { paperIndex, isIncluded, reason };
      } catch (error) {
        logger.error("Screening failed for paper, using conservative fallback", error, {
          batchStartIndex: args.batchStartIndex,
          paperIndex,
          title: paper.title,
        });
        return { paperIndex, isIncluded: true, reason: fallbackReason };
      }
    }),
    LITERATURE_BULK_LLM_CONCURRENCY
  );

  logger.info("Screening batch complete", {
    batchStartIndex: args.batchStartIndex,
    decisionCount: decisions.length,
  });
  return { decisions };
}

const screenPaperDecisionValidator = v.object({
  paperIndex: v.number(),
  isIncluded: v.boolean(),
  reason: v.string(),
});

export const screenPapersBatch = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    query: v.string(),
    batchStartIndex: v.number(),
    smartModel: v.optional(v.string()),
  },
  returns: v.object({
    decisions: v.array(screenPaperDecisionValidator),
  }),
  handler: screenPapersBatchHandler,
});

export async function screenPapersHandler(
  ctx: ActionCtx,
  args: { papers: any[]; query: string; smartModel?: string }
) {
  const logger = createServiceLogger("literatureReview", "screenPapers");

  if (args.papers.length === 0) {
    return { papers: [] };
  }

  const totalBatches = Math.ceil(args.papers.length / SCREEN_PAPERS_BATCH_SIZE);
  logger.info("Starting screening", {
    paperCount: args.papers.length,
    totalBatches,
  });

  try {
    const decisions = new Map<number, { isIncluded: boolean; reason: string }>();

    for (let i = 0; i < args.papers.length; i += SCREEN_PAPERS_BATCH_SIZE) {
      const batch = args.papers.slice(i, i + SCREEN_PAPERS_BATCH_SIZE);
      const { decisions: batchDecisions } = await ctx.runAction(
        internal.literatureReview.workflowSteps.screenPapersBatch,
        {
          papers: batch,
          query: args.query,
          batchStartIndex: i,
          smartModel: args.smartModel,
        }
      );

      for (const decision of batchDecisions) {
        decisions.set(decision.paperIndex, {
          isIncluded: decision.isIncluded,
          reason: decision.reason,
        });
      }
    }

    const screenedPapers = args.papers.map((p, index) => ({
      ...p,
      isIncluded: decisions.get(index)?.isIncluded ?? true,
      includeReason: decisions.get(index)?.reason ?? "No screening decision available.",
    }));

    logger.info("Screening complete", {
      paperCount: args.papers.length,
      includedCount: screenedPapers.filter((p) => p.isIncluded === true).length,
    });

    return { papers: compactPapersForWorkflow(screenedPapers) };
  } catch (error) {
    logger.error("Screening failed entirely, including all papers conservatively", error);

    const fallbackPapers = args.papers.map((p) => ({
      ...p,
      isIncluded: true,
      includeReason: "Included by conservative fallback due to screening error.",
    }));

    return { papers: compactPapersForWorkflow(fallbackPapers) };
  }
}

export const screenPapers = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    query: v.string(),
    smartModel: v.optional(v.string()),
  },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: screenPapersHandler,
});

async function extractPaperFieldsWithLlm(
  paper: {
    title: string;
    authors: string[];
    year?: number;
    abstract: string;
    url: string;
  },
  columns: Array<{ id: string; name: string; instructions?: string }>,
  query: string | undefined,
  smartModel: string | undefined
): Promise<Record<string, string> | undefined> {
  const llm = createLLM({
    apiKey: env.TOGETHER_AI_API_KEY,
    mapModel: bulkLlmModel(),
    temperatures: 0.2,
    maxTokens: 900,
    phase: "fast",
  });

  const structuredLlm = llm.withStructuredOutput(ExtractDataOutputSchema, {
    name: "extract_data",
  });

  const columnsText = columns
    .map(
      (col) =>
        `- ${col.name} (id: ${col.id}): ${col.instructions || "Extract relevant information."}`
    )
    .join("\n");

  const prompt = EXTRACT_DATA_PROMPT.replace(/{query}/g, query || "")
    .replace(/{title}/g, paper.title)
    .replace(/{authors}/g, paper.authors.join(", "))
    .replace(/{year}/g, paper.year !== undefined ? String(paper.year) : "N/A")
    .replace(/{abstract}/g, truncateForLiteratureLlm(paper.abstract))
    .replace(/{url}/g, paper.url)
    .replace(/{columns}/g, columnsText);

  const response = await invokeWithHttpRetry(
    () =>
      invokeWithTimeout(
        () =>
          structuredLlm.invoke([
            new SystemMessage(EXTRACT_DATA_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ]),
        EXTRACT_DATA_PER_PAPER_TIMEOUT_MS,
        "extractData"
      ),
    "extractData"
  );

  return response.extractedData;
}

/** One draft batch — separate action so extraction stays under Convex action limits. */
export async function extractDataBatchHandler(
  ctx: ActionCtx,
  args: {
    papers: any[];
    columns: any[];
    sessionId: Id<"literatureReviewSessions">;
    batchNumber: number;
    query?: string;
    smartModel?: string;
  }
) {
  const logger = createServiceLogger("literatureReview", "extractDataBatch");
  const batchSize = args.papers.length;
  logger.info("Extracting draft batch", {
    sessionId: args.sessionId,
    batchNumber: args.batchNumber,
    paperCount: batchSize,
  });

  const papersWithExtractedData = await allWithConcurrency(
    args.papers.map((paper) => async () => {
      try {
        const extractedData = await extractPaperFieldsWithLlm(
          paper,
          args.columns,
          args.query,
          args.smartModel
        );
        return extractedData ? { ...paper, extractedData } : paper;
      } catch (error) {
        logger.error(`Extraction failed for paper: ${paper.title}`, error);
        return paper;
      }
    }),
    LITERATURE_BULK_LLM_CONCURRENCY
  );

  await ctx.runMutation(internal.literatureReview.db.insertDraftBatch, {
    sessionId: args.sessionId,
    papers: papersWithExtractedData,
    columns: args.columns,
    batchNumber: args.batchNumber,
  });

  logger.info("Draft batch complete", {
    sessionId: args.sessionId,
    batchNumber: args.batchNumber,
    paperCount: batchSize,
  });
  return null;
}

export const extractDataBatch = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    columns: v.array(confirmedColumnValidator),
    sessionId: v.id("literatureReviewSessions"),
    batchNumber: v.number(),
    query: v.optional(v.string()),
    smartModel: v.optional(v.string()),
  },
  returns: v.null(),
  handler: extractDataBatchHandler,
});

/**
 * Runs all extraction batches in one action (eval / retries only).
 * The literature review workflow calls `extractDataBatch` per batch so each batch
 * gets its own Convex action time limit — do not call this from the workflow graph.
 */
export async function extractDataHandler(
  ctx: ActionCtx,
  args: {
    papers: any[];
    columns: any[];
    sessionId: Id<"literatureReviewSessions">;
    query?: string;
    smartModel?: string;
  }
) {
  const logger = createServiceLogger("literatureReview", "extractData");
  const included = args.papers.filter((p) => p.isIncluded === true);
  const existingBatchNumbers = await ctx.runQuery(
    internal.literatureReview.db.getExistingBatchNumbers,
    { sessionId: args.sessionId }
  );
  await runExtractDataBatches(ctx, {
    includedPapers: included,
    columns: args.columns,
    sessionId: args.sessionId,
    query: args.query,
    smartModel: args.smartModel,
    existingBatchNumbers,
    logger,
  });
  return null;
}

/** Shared batch loop for eval/retry entrypoints (nested under a single action). */
export async function runExtractDataBatches(
  ctx: ActionCtx,
  args: {
    includedPapers: any[];
    columns: any[];
    sessionId: Id<"literatureReviewSessions">;
    query?: string;
    smartModel?: string;
    existingBatchNumbers: number[];
    logger: ReturnType<typeof createServiceLogger>;
  }
) {
  const existingSet = new Set(args.existingBatchNumbers);
  const totalBatches = Math.ceil(args.includedPapers.length / EXTRACT_DATA_CHUNK_SIZE) || 0;

  args.logger.info("Starting extraction", {
    sessionId: args.sessionId,
    includedCount: args.includedPapers.length,
    totalBatches,
    skippedBatches: existingSet.size,
  });

  for (let b = 0; b < args.includedPapers.length; b += EXTRACT_DATA_CHUNK_SIZE) {
    const batchNumber = Math.floor(b / EXTRACT_DATA_CHUNK_SIZE);
    if (existingSet.has(batchNumber)) {
      continue;
    }
    const slice = args.includedPapers.slice(b, b + EXTRACT_DATA_CHUNK_SIZE);

    await ctx.runAction(internal.literatureReview.workflowSteps.extractDataBatch, {
      papers: slice,
      columns: args.columns,
      sessionId: args.sessionId,
      batchNumber,
      query: args.query,
      smartModel: args.smartModel,
    });
  }

  args.logger.info("Extraction orchestration complete", {
    sessionId: args.sessionId,
    includedCount: args.includedPapers.length,
    totalBatches,
  });
}

export const extractData = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    columns: v.array(confirmedColumnValidator),
    sessionId: v.id("literatureReviewSessions"),
    query: v.optional(v.string()),
    smartModel: v.optional(v.string()),
  },
  returns: v.null(),
  handler: extractDataHandler,
});

export async function generateTableHandler(
  ctx: ActionCtx,
  args: { sessionId: Id<"literatureReviewSessions">; columns: any[] }
): Promise<{ tableId: Id<"literatureTables"> }> {
  return await ctx.runMutation(internal.literatureReview.db.persistTable, {
    sessionId: args.sessionId,
    columns: args.columns,
  });
}

export const generateTable = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    columns: v.array(confirmedColumnValidator),
  },
  returns: v.object({ tableId: v.id("literatureTables") }),
  handler: generateTableHandler,
});

export async function generateReportHandler(
  ctx: ActionCtx,
  args: {
    sessionId: Id<"literatureReviewSessions">;
    tableId: Id<"literatureTables">;
    query: string;
    sections?: string[];
    smartModel?: string;
  }
): Promise<{ reportId: Id<"literatureReports"> }> {
  const logger = createServiceLogger("literatureReview", "generateReport");

  try {
    // Step 1: Read table data and drafts
    const table = await ctx.runQuery(internal.literatureReview.db.getTableById, {
      tableId: args.tableId,
    });

    if (!table) {
      throw new Error(`Literature table not found: ${args.tableId}`);
    }

    const drafts = await ctx.runQuery(internal.literatureReview.db.getDraftsBySession, {
      sessionId: args.sessionId,
    });

    // Step 2: Get citation info for all papers
    const citationIds = [...new Set(drafts.map((d) => d.citationId))];
    const citations = await ctx.runQuery(internal.literatureReview.db.getCitationsByIds, {
      citationIds,
    });

    const citationMap = new Map(citations.map((c) => [c._id, c]));

    // Generate citation keys
    const existingKeys = new Set<string>();
    const citationKeyMap = new Map<Id<"citations">, string>();

    for (const citation of citations) {
      const key = generateCitationKey(
        {
          paperId: citation.doi ?? citation.url,
          title: citation.title,
          authors: citation.authors,
          year: citation.year,
          doi: citation.doi,
          url: citation.url,
          sourceApi: "semantic_scholar", // Default since we don't have it stored
        },
        existingKeys
      );
      existingKeys.add(key);
      citationKeyMap.set(citation._id, key);
    }

    // Step 3: Build context string
    const contextParts: string[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      const citation = citationMap.get(draft.citationId);
      if (!citation) continue;

      const citationKey = citationKeyMap.get(draft.citationId) ?? `Paper${i + 1}`;
      const lines = [
        `Paper ${i + 1}: [${citationKey}]`,
        `- Title: ${citation.title}`,
        `- Authors: ${citation.authors.join(", ")}`,
        `- Year: ${citation.year ?? "N/A"}`,
        `- Extracted Data:`,
      ];

      for (const [colId, value] of Object.entries(draft.rowData)) {
        const column = table.columns.find((c) => c.id === colId);
        const colName = column?.name ?? colId;
        lines.push(`  - ${colName}: ${value}`);
      }

      contextParts.push(lines.join("\n"));
    }

    const context = contextParts.join("\n\n");

    const sessionContext = await ctx.runQuery(
      internal.literatureReview.db.getSessionReportContext,
      {
        sessionId: args.sessionId,
      }
    );
    const provenance = sessionContext?.workflowProvenance ?? {};
    const columnNames = table.columns.map((c) => c.name);

    const reportPapers: ReportPaperRow[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      const citation = citationMap.get(draft.citationId);
      if (!citation) continue;
      const citationKey = citationKeyMap.get(draft.citationId) ?? `Paper${i + 1}`;
      reportPapers.push({
        citationKey,
        title: citation.title,
        authors: citation.authors.join(", "),
        year: citation.year !== undefined ? String(citation.year) : "",
        rowData: draft.rowData,
      });
    }

    const allowedCitationKeys = new Set(citationKeyMap.values());
    const groundedNumericTokens = buildGroundedNumericSet(provenance, reportPapers);

    const sessionMetadata = JSON.stringify(provenance, null, 2);
    const methodsBlock = buildPrismaMethodsBlock(provenance);
    const studyTable = buildStudyCharacteristicsTable(reportPapers, columnNames);
    logger.info("Starting report generation", {
      paperCount: drafts.length,
      sectionCount: 6,
    });

    // Step 4: Generate sections
    const sections = args.sections ?? [
      "Abstract",
      "Introduction",
      "Methods",
      "Results",
      "Discussion",
      "Conclusion",
    ];
    const sectionContent = new Map<string, string>();

    const llm = createLLM({
      apiKey: env.TOGETHER_AI_API_KEY,
      mapModel: mapModelForLiteratureReview(args.smartModel),
      temperatures: 0.3,
      maxTokens: 2000,
      phase: "smart",
    });

    const citationsBlock = Array.from(citationKeyMap.entries())
      .map(([id, key]) => {
        const c = citationMap.get(id);
        return c ? `[${key}] ${c.title} (${c.year ?? "N/A"})` : "";
      })
      .filter(Boolean)
      .join("\n");

    const generateOneSection = async (sectionName: string): Promise<string> => {
      const prompt = GENERATE_REPORT_SECTION_PROMPT.replace(/{section}/g, sectionName)
        .replace(/{query}/g, args.query)
        .replace(/{sessionMetadata}/g, sessionMetadata)
        .replace(/{extractedData}/g, context)
        .replace(/{citations}/g, citationsBlock);

      const response = await invokeWithHttpRetry(
        () =>
          llm.invoke([
            new SystemMessage(GENERATE_REPORT_SECTION_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ]),
        `generateReport_${sectionName}`
      );

      return typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    };

    // Use single-call mode when generating all 6 standard sections (faster, one round-trip)
    const isFullReport =
      sections.length === 6 &&
      sections.every((s) =>
        ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion"].includes(s)
      );

    if (isFullReport) {
      try {
        const fullLlm = createLLM({
          apiKey: env.TOGETHER_AI_API_KEY,
          mapModel: mapModelForLiteratureReview(args.smartModel),
          temperatures: 0.3,
          maxTokens: 8000,
          phase: "smart",
        });
        const structuredLlm = fullLlm.withStructuredOutput(GenerateFullReportOutputSchema, {
          name: "generate_full_report",
        });

        const prompt = GENERATE_FULL_REPORT_PROMPT.replace(/{query}/g, args.query)
          .replace(/{sessionMetadata}/g, sessionMetadata)
          .replace(/{extractedData}/g, context)
          .replace(/{citations}/g, citationsBlock);

        const response = await invokeWithHttpRetry(
          () =>
            structuredLlm.invoke([
              new SystemMessage(GENERATE_FULL_REPORT_SYSTEM_PROMPT),
              new HumanMessage(prompt),
            ]),
          "generateFullReport"
        );

        for (const sectionName of sections) {
          const found = response.sections.find(
            (s) => s.heading.toLowerCase() === sectionName.toLowerCase()
          );
          if (found && !isTrivialReportSectionContent(found.content, sectionName)) {
            sectionContent.set(sectionName, found.content);
            logger.info(`Generated section: ${sectionName}`, {
              sectionName,
              contentLength: found.content.length,
              source: "full_report",
            });
          }
        }

        const needsRegen = getReportSectionsNeedingRegeneration(response.sections, sections);
        if (needsRegen.length > 0) {
          logger.warn("Full report returned placeholder or short sections; regenerating", {
            sections: needsRegen,
            sectionLengths: response.sections.map((s) => ({
              heading: s.heading,
              contentLength: s.content.length,
            })),
          });
        }
      } catch (error) {
        logger.error("Full report generation failed, falling back to per-section mode", error);
      }
    }

    const sectionsToGenerate = sections.filter((name) => !sectionContent.has(name));
    for (const sectionName of sectionsToGenerate) {
      try {
        const content = await generateOneSection(sectionName);
        if (isTrivialReportSectionContent(content, sectionName)) {
          logger.warn(`Per-section output still trivial for ${sectionName}`, {
            contentLength: content.length,
          });
        }
        sectionContent.set(sectionName, content);
        logger.info(`Generated section: ${sectionName}`, {
          sectionName,
          contentLength: content.length,
          source: "per_section",
        });
      } catch (error) {
        logger.error(`Failed to generate section: ${sectionName}`, error);
        sectionContent.set(sectionName, `[${sectionName} generation failed]`);
      }
    }

    let generatedSections: Array<{ heading: string; content: string }> = sections.map(
      (sectionName) => ({
        heading: sectionName,
        content: sectionContent.get(sectionName) ?? `[${sectionName} generation failed]`,
      })
    );

    const {
      sections: sanitized,
      unknownCitations,
      ungroundedNumerics,
    } = validateAndSanitizeReportSections(
      generatedSections,
      allowedCitationKeys,
      groundedNumericTokens
    );
    if (unknownCitations.length > 0) {
      logger.warn("Removed unknown citation keys from report", { unknownCitations });
    }
    if (ungroundedNumerics.length > 0) {
      logger.warn("Report contains potentially ungrounded numerics", { ungroundedNumerics });
    }
    generatedSections = mergeDeterministicReportSections(sanitized, {
      methodsBlock,
      studyTable,
    });

    // Step 5: Combine sections into full markdown report
    const fullContent = generatedSections
      .map((s) => `## ${s.heading}\n\n${s.content}`)
      .join("\n\n");

    logger.info("Report generation complete", {
      sectionCount: generatedSections.length,
      totalLength: fullContent.length,
    });

    // Step 6: Resolve display title (session plan title, else generate from report content)
    let reportTitle: string | undefined;
    const session = await ctx.runQuery(internal.literatureReview.db.getSessionTitleContext, {
      sessionId: args.sessionId,
    });
    if (session?.reviewTitle) {
      reportTitle = literatureReportTitle(session.reviewTitle);
    } else {
      const abstractSection =
        generatedSections.find((s) => s.heading.toLowerCase() === "abstract")?.content ??
        fullContent.slice(0, 2000);
      try {
        const generated = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
          chunk: `Literature review topic: ${args.query}\n\n${abstractSection}`,
        });
        reportTitle = literatureReportTitle(generated);
        await ctx.runMutation(internal.literatureReview.db.setSessionReviewTitle, {
          sessionId: args.sessionId,
          reviewTitle: reportTitle,
        });
      } catch (titleError) {
        logger.error("Report title generation failed", titleError);
        reportTitle = literatureReportTitle(fallbackReviewTitleFromQuery(args.query));
      }
    }

    // Step 7: Persist report
    return await ctx.runMutation(internal.literatureReview.db.persistReport, {
      sessionId: args.sessionId,
      tableId: args.tableId,
      query: args.query,
      title: reportTitle,
      content: fullContent,
      sections: generatedSections,
      citationIds: Array.from(citationKeyMap.keys()),
    });
  } catch (error) {
    logger.error("Report generation failed", error);
    await ctx.runMutation(internal.literatureReview.db.patchSessionStatus, {
      sessionId: args.sessionId,
      status: "failed",
    });
    await ctx.runMutation(internal.literatureReview.db.persistReport, {
      sessionId: args.sessionId,
      tableId: args.tableId,
      query: args.query,
      status: "failed",
    });
    throw error;
  }
}

export const generateReport = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    tableId: v.id("literatureTables"),
    query: v.string(),
    sections: v.optional(v.array(v.string())),
    smartModel: v.optional(v.string()),
  },
  returns: v.object({ reportId: v.id("literatureReports") }),
  handler: generateReportHandler,
});
