import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createLLM } from "../_agents/_shared/llm_factory.js";
import { invokeWithHttpRetry } from "../_agents/_shared/retry.js";
import { createServiceLogger } from "../_lib/logging/serviceLogger.js";
import { env } from "../_lib/env.js";
import {
  PLAN_REVIEW_SYSTEM_PROMPT,
  PLAN_REVIEW_PROMPT,
  PlanReviewOutputSchema,
} from "../_agents/literature_review/prompts.js";

const literaturePaperFields = {
  title: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  abstract: v.string(),
  url: v.string(),
  pdfUrl: v.optional(v.string()),
  source: v.union(
    v.literal("arxiv"),
    v.literal("semantic_scholar"),
    v.literal("pubmed")
  ),
  citationCount: v.optional(v.number()),
  doi: v.optional(v.string()),
  score: v.number(),
  isIncluded: v.optional(v.boolean()),
  includeReason: v.optional(v.string()),
};

const literaturePaperValidator = v.object(literaturePaperFields);

const confirmedColumnValidator = v.object({
  id: v.string(),
  name: v.string(),
  instructions: v.optional(v.string()),
  isVisible: v.boolean(),
});

function dedupePapers<T extends { doi?: string; title: string; authors: string[] }>(papers: T[]): T[] {
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

export const planReview = internalAction({
  args: { query: v.string() },
  returns: v.object({
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
  handler: async (_ctx, args) => {
    const q = args.query.trim();
    if (q.length === 0) {
      return { searchQueries: [], suggestedColumns: [] };
    }

    const logger = createServiceLogger("literatureReview", "planReview");

    try {
      const llm = createLLM({
        apiKey: env.TOGETHER_AI_API_KEY,
        mapModel: env.SMART_LLM || env.FAST_LLM,
        temperatures: 0.3,
        maxTokens: 2000,
        phase: "smart",
      });

      const structuredLlm = llm.withStructuredOutput(PlanReviewOutputSchema, {
        name: "plan_review",
      });

      const prompt = PLAN_REVIEW_PROMPT.replace(/{query}/g, args.query);

      const response = await invokeWithHttpRetry(
        () =>
          structuredLlm.invoke([
            new SystemMessage(PLAN_REVIEW_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ]),
        "planReview"
      );

      return {
        searchQueries: response.searchQueries,
        suggestedColumns: response.suggestedColumns,
      };
    } catch (error) {
      logger.error("LLM call failed", error);
      return {
        searchQueries: [q],
        suggestedColumns: [],
      };
    }
  },
});

export const searchPapers = internalAction({
  args: {
    query: v.string(),
    searchQueries: v.array(v.string()),
  },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: async (ctx, args) => {
    const queries = args.searchQueries.length > 0 ? args.searchQueries : [args.query];
    const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
    const merged: Array<{
      title: string;
      authors: string[];
      year?: number;
      abstract: string;
      url: string;
      pdfUrl?: string;
      source: "arxiv" | "semantic_scholar" | "pubmed";
      citationCount?: number;
      doi?: string;
      score: number;
    }> = [];

    for (const q of unique) {
      const batch = await ctx.runAction(
        internal._services.search.AcademicSearchService.searchInternal,
        {
          query: q,
          maxResults: 25,
          sortBy: "relevance",
        }
      );
      for (const p of batch) {
        merged.push({
          title: p.title,
          authors: p.authors,
          year: p.year,
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

    return { papers: dedupePapers(merged) };
  },
});

export const deduplicatePapers = internalAction({
  args: { papers: v.array(literaturePaperValidator) },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: async (_ctx, args) => {
    return { papers: dedupePapers(args.papers) };
  },
});

export const rankPapers = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    query: v.string(),
  },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: async (_ctx, args) => {
    void args.query;
    const sorted = [...args.papers].sort((a, b) => b.score - a.score);
    return { papers: sorted };
  },
});

export const screenPapers = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    query: v.string(),
  },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: async (_ctx, args) => {
    void args.query;
    const top = args.papers.slice(0, 30);
    const papers = top.map((p, i) => ({
      ...p,
      isIncluded: i < 30,
      includeReason: i < 30 ? "Included in top 30 by relevance score." : undefined,
    }));
    return { papers };
  },
});

export const extractData = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    columns: v.array(confirmedColumnValidator),
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const included = args.papers.filter((p) => p.isIncluded === true);
    const chunkSize = 5;
    for (let b = 0; b < included.length; b += chunkSize) {
      const slice = included.slice(b, b + chunkSize);
      await ctx.runMutation(internal.literatureReview.db.insertDraftBatch, {
        sessionId: args.sessionId,
        papers: slice,
        columns: args.columns,
        batchNumber: Math.floor(b / chunkSize),
      });
    }
    return null;
  },
});

export const generateTable = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    columns: v.array(confirmedColumnValidator),
  },
  returns: v.object({ tableId: v.id("literatureTables") }),
  handler: async (ctx, args): Promise<{ tableId: Id<"literatureTables"> }> => {
    return await ctx.runMutation(internal.literatureReview.db.persistTable, {
      sessionId: args.sessionId,
      columns: args.columns,
    });
  },
});

export const generateReport = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    tableId: v.id("literatureTables"),
    query: v.string(),
  },
  returns: v.object({ reportId: v.id("literatureReports") }),
  handler: async (ctx, args): Promise<{ reportId: Id<"literatureReports"> }> => {
    return await ctx.runMutation(internal.literatureReview.db.persistReport, {
      sessionId: args.sessionId,
      tableId: args.tableId,
      query: args.query,
    });
  },
});
