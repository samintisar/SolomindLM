import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createLLM } from "../_agents/_shared/llm_factory.js";
import { invokeWithHttpRetry } from "../_agents/_shared/retry.js";
import { createServiceLogger } from "../_lib/logging/serviceLogger.js";
import { env } from "../_lib/env.js";
import { cachedRerank } from "../_agents/chat/rerankCache.js";
import {
  PLAN_REVIEW_SYSTEM_PROMPT,
  PLAN_REVIEW_PROMPT,
  PlanReviewOutputSchema,
  SCREEN_PAPERS_SYSTEM_PROMPT,
  SCREEN_PAPERS_PROMPT,
  ScreenPapersOutputSchema,
  GENERATE_REPORT_SECTION_SYSTEM_PROMPT,
  GENERATE_REPORT_SECTION_PROMPT,
} from "../_agents/literature_review/prompts.js";
import { generateCitationKey } from "../_utils/CitationEngine.js";

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
  handler: async (ctx, args) => {
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

      const scoreMap = new Map(reranked.map((r, i) => [r.id, { score: r.score ?? (30 - i), index: i }]));

      const sorted = [...args.papers].map((p, i) => ({
        ...p,
        score: scoreMap.get(String(i))?.score ?? p.score,
      })).sort((a, b) => b.score - a.score);

      logger.info("Reranking complete", {
        paperCount: sorted.length,
        topScore: sorted[0]?.score,
      });

      return { papers: sorted };
    } catch (error) {
      logger.error("Reranking failed, falling back to original scores", error, {
        paperCount: args.papers.length,
      });
      const sorted = [...args.papers].sort((a, b) => b.score - a.score);
      return { papers: sorted };
    }
  },
});

export const screenPapers = internalAction({
  args: {
    papers: v.array(literaturePaperValidator),
    query: v.string(),
  },
  returns: v.object({ papers: v.array(literaturePaperValidator) }),
  handler: async (_ctx, args) => {
    const logger = createServiceLogger("literatureReview", "screenPapers");

    if (args.papers.length === 0) {
      return { papers: [] };
    }

    try {
      const llm = createLLM({
        apiKey: env.TOGETHER_AI_API_KEY,
        mapModel: env.SMART_LLM || env.FAST_LLM,
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
        includeReason:
          decisions.get(i)?.reason ?? "No screening decision available.",
      }));

      return { papers: screenedPapers };
    } catch (error) {
      logger.error("Screening failed entirely, including all papers conservatively", error);

      const fallbackPapers = args.papers.map((p) => ({
        ...p,
        isIncluded: true,
        includeReason: "Included by conservative fallback due to screening error.",
      }));

      return { papers: fallbackPapers };
    }
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

      logger.info("Starting report generation", {
        paperCount: drafts.length,
        sectionCount: 6,
      });

      // Step 4: Generate each section
      const sections = ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion"];
      const generatedSections: Array<{ heading: string; content: string }> = [];

      const llm = createLLM({
        apiKey: env.TOGETHER_AI_API_KEY,
        mapModel: env.SMART_LLM || env.FAST_LLM,
        temperatures: 0.3,
        maxTokens: 2000,
        phase: "smart",
      });

      for (const sectionName of sections) {
        try {
          const prompt = GENERATE_REPORT_SECTION_PROMPT
            .replace(/{section}/g, sectionName)
            .replace(/{query}/g, args.query)
            .replace(/{extractedData}/g, context)
            .replace(/{citations}/g, Array.from(citationKeyMap.entries())
              .map(([id, key]) => {
                const c = citationMap.get(id);
                return c ? `[${key}] ${c.title} (${c.year ?? "N/A"})` : "";
              })
              .filter(Boolean)
              .join("\n"));

          const response = await invokeWithHttpRetry(
            () =>
              llm.invoke([
                new SystemMessage(GENERATE_REPORT_SECTION_SYSTEM_PROMPT),
                new HumanMessage(prompt),
              ]),
            `generateReport_${sectionName}`
          );

          const content = typeof response.content === "string"
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

      // Step 5: Combine sections into full markdown report
      const fullContent = generatedSections
        .map((s) => `## ${s.heading}\n\n${s.content}`)
        .join("\n\n");

      logger.info("Report generation complete", {
        sectionCount: generatedSections.length,
        totalLength: fullContent.length,
      });

      // Step 6: Persist report
      return await ctx.runMutation(internal.literatureReview.db.persistReport, {
        sessionId: args.sessionId,
        tableId: args.tableId,
        query: args.query,
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
  },
});
