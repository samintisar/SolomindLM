import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createLLM } from "../_agents/_shared/llm_factory.js";
import { resolveSmartModel } from "../_lib/resolveSmartModel.js";
import { invokeWithHttpRetry } from "../_agents/_shared/retry.js";
import { createServiceLogger } from "../_lib/logging/serviceLogger.js";
import { env } from "../_lib/env.js";
import { cachedRerank } from "../_agents/chat/rerankCache.js";
import {
  BENCHMARK_RELIABILITY_SUGGESTED_COLUMNS,
  isBenchmarkReliabilityQuestion,
  isLegacyGenericColumnSet,
  PLAN_REVIEW_COLUMN_RETRY_APPENDIX,
} from "../_agents/literature_review/planReviewColumns.js";
import {
  PLAN_REVIEW_SYSTEM_PROMPT,
  PLAN_REVIEW_PROMPT,
  PlanReviewOutputSchema,
  SCREEN_PAPERS_SYSTEM_PROMPT,
  SCREEN_PAPERS_PROMPT,
  ScreenPapersOutputSchema,
  GENERATE_REPORT_SECTION_SYSTEM_PROMPT,
  GENERATE_REPORT_SECTION_PROMPT,
  GENERATE_FULL_REPORT_SYSTEM_PROMPT,
  GENERATE_FULL_REPORT_PROMPT,
  GenerateFullReportOutputSchema,
  EXTRACT_DATA_SYSTEM_PROMPT,
  EXTRACT_DATA_PROMPT,
  ExtractDataOutputSchema,
} from "../_agents/literature_review/prompts.js";
import { generateCitationKey } from "../_utils/CitationEngine.js";
import { normalizePublicationYear, searchCache } from "../_services/search/AcademicSearchService.js";
import { ARXIV_MIN_INTERVAL_MS } from "../_lib/arxivThrottle.js";
import {
  literatureSearchOptionsValidator,
  sourcesForResearchDatabase,
} from "../_model/literatureReviewSearchOptions.js";
import {
  fallbackReviewTitleFromQuery,
  literatureReportTitle,
  normalizeReviewTitle,
} from "./titles.js";
import {
  compactPapersForSnapshot,
  compactPapersForWorkflow,
  compactRankedPapersForWorkflow,
} from "./rankedPapersSnapshot.js";
import {
  buildGroundedNumericSet,
  buildPrismaMethodsBlock,
  buildStudyCharacteristicsTable,
  needsDeterministicReportMerge,
  mergeDeterministicReportSections,
  validateAndSanitizeReportSections,
  type ReportPaperRow,
} from "./reportContext.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    if (
      isLegacyGenericColumnSet(response.suggestedColumns) &&
      isBenchmarkReliabilityQuestion(q)
    ) {
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
  ) => Promise<any[]>
) {
  const queries = args.searchQueries.length > 0 ? args.searchQueries : [args.query];
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
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
    for (const p of batch) {
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

export async function screenPapersHandler(
  _ctx: ActionCtx,
  args: { papers: any[]; query: string; smartModel?: string }
) {
  const logger = createServiceLogger("literatureReview", "screenPapers");

  if (args.papers.length === 0) {
    return { papers: [] };
  }

  try {
    const llm = createLLM({
      apiKey: env.TOGETHER_AI_API_KEY,
      mapModel: mapModelForLiteratureReview(args.smartModel),
      temperatures: 0.3,
      maxTokens: 2000,
      phase: "smart",
    });

    const structuredLlm = llm.withStructuredOutput(ScreenPapersOutputSchema, {
      name: "screen_papers",
    });

    const batchSize = 5;
    const decisions = new Map<number, { isIncluded: boolean; reason: string }>();

    for (let i = 0; i < args.papers.length; i += batchSize) {
      const batch = args.papers.slice(i, i + batchSize);

      const papersText = batch
        .map(
          (p, idx) =>
            `Paper ${idx + 1}:
Title: ${p.title}
Abstract: ${p.abstract}
---`
        )
        .join("\n");

      const prompt = SCREEN_PAPERS_PROMPT.replace(/{query}/g, args.query).replace(
        /{papers}/g,
        papersText
      );

      try {
        const response = await invokeWithHttpRetry(
          () =>
            structuredLlm.invoke([
              new SystemMessage(SCREEN_PAPERS_SYSTEM_PROMPT),
              new HumanMessage(prompt),
            ]),
          "screenPapers"
        );

        for (const decision of response.decisions) {
          const match = decision.paperId.match(/paper_(\d+)/);
          if (match) {
            const batchIndex = parseInt(match[1], 10) - 1;
            if (batchIndex >= 0 && batchIndex < batch.length) {
              decisions.set(i + batchIndex, {
                isIncluded: decision.isIncluded,
                reason: decision.reason,
              });
            }
          }
        }
      } catch (error) {
        logger.error(
          `Batch starting at index ${i} failed, including all papers conservatively`,
          error,
          {
            batchStart: i,
            batchSize: batch.length,
          }
        );
        for (let j = 0; j < batch.length; j++) {
          decisions.set(i + j, {
            isIncluded: true,
            reason: "Included by conservative fallback due to screening error.",
          });
        }
      }
    }

    const screenedPapers = args.papers.map((p, i) => ({
      ...p,
      isIncluded: decisions.get(i)?.isIncluded ?? true,
      includeReason: decisions.get(i)?.reason ?? "No screening decision available.",
    }));

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
  const chunkSize = 5;

  // Check which batches already exist to support idempotent retries
  const existingBatchNumbers = await ctx.runQuery(
    internal.literatureReview.db.getExistingBatchNumbers,
    { sessionId: args.sessionId }
  );
  const existingSet = new Set(existingBatchNumbers);

  for (let b = 0; b < included.length; b += chunkSize) {
    const batchNumber = Math.floor(b / chunkSize);
    if (existingSet.has(batchNumber)) {
      continue;
    }
    const slice = included.slice(b, b + chunkSize);

    // LLM-based data extraction for each paper in the batch
    const papersWithExtractedData = await Promise.all(
      slice.map(async (paper) => {
        try {
          const llm = createLLM({
            apiKey: env.TOGETHER_AI_API_KEY,
            mapModel: mapModelForLiteratureReview(args.smartModel),
            temperatures: 0.2,
            maxTokens: 1500,
            phase: "smart",
          });

          const structuredLlm = llm.withStructuredOutput(ExtractDataOutputSchema, {
            name: "extract_data",
          });

          const columnsText = args.columns
            .map(
              (col: { id: string; name: string; instructions?: string }) =>
                `- ${col.name} (id: ${col.id}): ${col.instructions || "Extract relevant information."}`
            )
            .join("\n");

          const prompt = EXTRACT_DATA_PROMPT.replace(/{query}/g, args.query || "")
            .replace(/{title}/g, paper.title)
            .replace(/{authors}/g, paper.authors.join(", "))
            .replace(/{year}/g, paper.year !== undefined ? String(paper.year) : "N/A")
            .replace(/{abstract}/g, paper.abstract)
            .replace(/{url}/g, paper.url)
            .replace(/{columns}/g, columnsText);

          const response = await invokeWithHttpRetry(
            () =>
              structuredLlm.invoke([
                new SystemMessage(EXTRACT_DATA_SYSTEM_PROMPT),
                new HumanMessage(prompt),
              ]),
            "extractData"
          );

          return {
            ...paper,
            extractedData: response.extractedData,
          };
        } catch (error) {
          logger.error(`Extraction failed for paper: ${paper.title}`, error);
          // Fallback: return paper without extractedData so insertDraftBatch uses basic metadata
          return paper;
        }
      })
    );

    await ctx.runMutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId: args.sessionId,
      papers: papersWithExtractedData,
      columns: args.columns,
      batchNumber,
    });
  }
  return null;
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

    const sessionContext = await ctx.runQuery(internal.literatureReview.db.getSessionReportContext, {
      sessionId: args.sessionId,
    });
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
    const generatedSections: Array<{ heading: string; content: string }> = [];

    const llm = createLLM({
      apiKey: env.TOGETHER_AI_API_KEY,
      mapModel: mapModelForLiteratureReview(args.smartModel),
      temperatures: 0.3,
      maxTokens: 2000,
      phase: "smart",
    });

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
          maxTokens: 6000,
          phase: "smart",
        });
        const structuredLlm = fullLlm.withStructuredOutput(GenerateFullReportOutputSchema, {
          name: "generate_full_report",
        });

        const citationsBlock = Array.from(citationKeyMap.entries())
          .map(([id, key]) => {
            const c = citationMap.get(id);
            return c ? `[${key}] ${c.title} (${c.year ?? "N/A"})` : "";
          })
          .filter(Boolean)
          .join("\n");

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
          const content = found?.content ?? `[${sectionName} generation failed]`;
          generatedSections.push({ heading: sectionName, content });
          logger.info(`Generated section: ${sectionName}`, {
            sectionName,
            contentLength: content.length,
          });
        }
      } catch (error) {
        logger.error("Full report generation failed, falling back to per-section mode", error);
        // Fall through to per-section mode
      }
    }

    if (generatedSections.length > 0) {
      const { sections: sanitized, unknownCitations, ungroundedNumerics } =
        validateAndSanitizeReportSections(
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
      generatedSections.length = 0;
      generatedSections.push(
        ...mergeDeterministicReportSections(sanitized, {
          methodsBlock,
          studyTable,
        })
      );
    }

    // Per-section fallback (for partial reports or if single-call failed)
    if (generatedSections.length === 0) {
      for (const sectionName of sections) {
        try {
          const citationsBlock = Array.from(citationKeyMap.entries())
            .map(([id, key]) => {
              const c = citationMap.get(id);
              return c ? `[${key}] ${c.title} (${c.year ?? "N/A"})` : "";
            })
            .filter(Boolean)
            .join("\n");

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

          const content =
            typeof response.content === "string"
              ? response.content
              : JSON.stringify(response.content);

          generatedSections.push({
            heading: sectionName,
            content,
          });

          logger.info(`Generated section: ${sectionName}`, {
            sectionName,
            contentLength: content.length,
          });
        } catch (error) {
          logger.error(`Failed to generate section: ${sectionName}`, error);
          generatedSections.push({
            heading: sectionName,
            content: "[Section generation failed]",
          });
        }
      }
    }

    if (generatedSections.length > 0 && needsDeterministicReportMerge(generatedSections)) {
      const { sections: sanitized } = validateAndSanitizeReportSections(
        generatedSections,
        allowedCitationKeys,
        groundedNumericTokens
      );
      generatedSections.length = 0;
      generatedSections.push(
        ...mergeDeterministicReportSections(sanitized, {
          methodsBlock,
          studyTable,
        })
      );
    }

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
    // Fallback to placeholder report
    return await ctx.runMutation(internal.literatureReview.db.persistReport, {
      sessionId: args.sessionId,
      tableId: args.tableId,
      query: args.query,
    });
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
