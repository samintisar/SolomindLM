import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { compactPapersForSnapshot } from "./rankedPapersSnapshot.js";
import {
  alignExtractedDataToColumns,
  formatPaperTitleYear,
  isTitleLikeColumnName,
} from "./reportContext.js";
import {
  fallbackReviewTitleFromQuery,
  literatureReportTitle,
  literatureTableTitle,
  normalizeReviewTitle,
} from "./titles.js";
import { literatureReviewWorkflowProvenanceValidator } from "./workflowProvenance.js";

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

const suggestedColumnValidator = v.object({
  id: v.string(),
  name: v.string(),
  instructions: v.optional(v.string()),
  isVisible: v.boolean(),
});

export const createEvalSession = internalMutation({
  args: {
    query: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    suggestedColumns: v.array(suggestedColumnValidator),
    confirmedColumns: v.array(confirmedColumnValidator),
  },
  returns: v.id("literatureReviewSessions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("literatureReviewSessions", {
      query: args.query,
      notebookId: args.notebookId,
      userId: args.userId,
      workflowId: "eval-inline",
      status: "processing",
      suggestedColumns: args.suggestedColumns,
      confirmedColumns: args.confirmedColumns,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const completeEvalSession = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      status: "completed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const insertDraftBatch = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    papers: v.array(literaturePaperValidator),
    columns: v.array(confirmedColumnValidator),
    batchNumber: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (let i = 0; i < args.papers.length; i++) {
      const paper = args.papers[i];
      if (paper.isIncluded !== true) continue;

      const citationKey = `lr_${args.sessionId}_${args.batchNumber}_${i}_${now}`;
      const citationId = await ctx.db.insert("citations", {
        paperId: paper.doi ?? paper.url,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        pdfUrl: paper.pdfUrl,
        sourceApi: paper.source,
        citationCount: paper.citationCount,
        abstract: paper.abstract,
        citationKey,
      });

      // Start with extracted data aligned to column ids (LLM keys often use display names)
      const rowData: Record<string, string> = paper.extractedData
        ? alignExtractedDataToColumns(paper.extractedData, args.columns)
        : {};

      // Always inject core bibliographic fields regardless of column configuration
      rowData["title"] = paper.title;
      rowData["authors"] = paper.authors.join(", ");
      rowData["year"] = paper.year !== undefined ? String(paper.year) : "";
      rowData["summary"] = paper.abstract.slice(0, 2000);

      // Also backfill any configured columns that map to these fields
      const yearStr = paper.year !== undefined ? String(paper.year) : "";
      const basicMap: Record<string, string> = {
        title: paper.title,
        authors: paper.authors.join(", "),
        year: yearStr,
        summary: paper.abstract.slice(0, 2000),
      };
      const titleYearFormatted = formatPaperTitleYear(paper.title, yearStr);
      for (const col of args.columns) {
        const empty =
          !rowData[col.id] || rowData[col.id].trim() === "" || rowData[col.id] === "N/A";
        if (isTitleLikeColumnName(col.id) || isTitleLikeColumnName(col.name)) {
          if (empty && titleYearFormatted) {
            rowData[col.id] = titleYearFormatted;
          }
          continue;
        }
        if (basicMap[col.id] && empty) {
          rowData[col.id] = basicMap[col.id];
        }
      }

      await ctx.db.insert("literatureTableDrafts", {
        sessionId: args.sessionId,
        citationId,
        rowData,
        includeReason: paper.includeReason,
        isIncluded: true,
        batchNumber: args.batchNumber,
        createdAt: now,
      });
    }
    return null;
  },
});

export const persistTable = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    columns: v.array(confirmedColumnValidator),
  },
  returns: v.object({ tableId: v.id("literatureTables") }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Literature review session not found");

    const drafts = await ctx.db
      .query("literatureTableDrafts")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const papers: Array<{
      citationId: Id<"citations">;
      rowData: Record<string, string>;
      includeReason?: string;
      isIncluded: boolean;
    }> = [];

    for (const d of drafts) {
      papers.push({
        citationId: d.citationId,
        rowData: d.rowData,
        includeReason: d.includeReason,
        isIncluded: d.isIncluded,
      });
    }

    const now = Date.now();
    const tableColumns = args.columns.map((c, order) => ({
      id: c.id,
      name: c.name,
      type: "custom" as const,
      instructions: c.instructions,
      isVisible: c.isVisible,
      isSystem: false,
      order,
    }));

    const reviewTitle = session.reviewTitle
      ? normalizeReviewTitle(session.reviewTitle)
      : fallbackReviewTitleFromQuery(session.query);

    const tableId = await ctx.db.insert("literatureTables", {
      title: literatureTableTitle(reviewTitle),
      description: undefined,
      notebookId: session.notebookId,
      userId: session.userId,
      status: "completed",
      columns: tableColumns,
      papers,
      literatureReviewSessionId: args.sessionId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.sessionId, {
      tableId,
      updatedAt: now,
    });

    return { tableId };
  },
});

export const getTableById = internalQuery({
  args: {
    tableId: v.id("literatureTables"),
  },
  returns: v.union(
    v.object({
      title: v.string(),
      description: v.optional(v.string()),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
      columns: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          type: v.union(
            v.literal("paper_title"),
            v.literal("authors"),
            v.literal("year"),
            v.literal("study_type"),
            v.literal("custom")
          ),
          instructions: v.optional(v.string()),
          isVisible: v.boolean(),
          isSystem: v.boolean(),
          order: v.number(),
        })
      ),
      papers: v.array(
        v.object({
          citationId: v.id("citations"),
          rowData: v.record(v.string(), v.string()),
          includeReason: v.optional(v.string()),
          isIncluded: v.boolean(),
        })
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return null;
    return {
      title: table.title,
      description: table.description,
      notebookId: table.notebookId,
      userId: table.userId,
      status: table.status,
      columns: table.columns,
      papers: table.papers,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  },
});

export const getDraftsBySession = internalQuery({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.array(
    v.object({
      citationId: v.id("citations"),
      rowData: v.record(v.string(), v.string()),
      includeReason: v.optional(v.string()),
      isIncluded: v.boolean(),
      batchNumber: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const drafts = await ctx.db
      .query("literatureTableDrafts")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return drafts.map((d) => ({
      citationId: d.citationId,
      rowData: d.rowData,
      includeReason: d.includeReason,
      isIncluded: d.isIncluded,
      batchNumber: d.batchNumber,
    }));
  },
});

export const persistRankedPapers = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    papers: v.array(literaturePaperValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const snapshot = compactPapersForSnapshot(args.papers).map((p) => ({
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
    }));

    const existing = await ctx.db
      .query("literatureReviewRankedPapers")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        papers: snapshot,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("literatureReviewRankedPapers", {
        sessionId: args.sessionId,
        papers: snapshot,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const getExistingBatchNumbers = internalQuery({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    const drafts = await ctx.db
      .query("literatureTableDrafts")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const batchNumbers = new Set<number>();
    for (const d of drafts) {
      batchNumbers.add(d.batchNumber);
    }
    return Array.from(batchNumbers);
  },
});

export const getCitationsByIds = internalQuery({
  args: {
    citationIds: v.array(v.id("citations")),
  },
  returns: v.array(
    v.object({
      _id: v.id("citations"),
      title: v.string(),
      authors: v.array(v.string()),
      year: v.optional(v.number()),
      citationKey: v.string(),
      doi: v.optional(v.string()),
      url: v.string(),
      abstract: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const citations = [];
    for (const id of args.citationIds) {
      const citation = await ctx.db.get(id);
      if (citation) {
        citations.push({
          _id: id,
          title: citation.title,
          authors: citation.authors,
          year: citation.year,
          citationKey: citation.citationKey,
          doi: citation.doi,
          url: citation.url,
          abstract: citation.abstract,
        });
      }
    }
    return citations;
  },
});

export const setSessionReviewTitle = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    reviewTitle: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      reviewTitle: normalizeReviewTitle(args.reviewTitle),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getSessionTitleContext = internalQuery({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.union(
    v.object({
      reviewTitle: v.optional(v.string()),
      query: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    return { reviewTitle: session.reviewTitle, query: session.query };
  },
});

export const patchSessionStatus = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    status: v.union(
      v.literal("planning"),
      v.literal("awaiting_columns"),
      v.literal("searching"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: args.status, updatedAt: Date.now() });
    return null;
  },
});

export const persistReport = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    tableId: v.id("literatureTables"),
    query: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("generating"), v.literal("completed"), v.literal("failed"))
    ),
    sections: v.optional(
      v.array(
        v.object({
          heading: v.string(),
          content: v.string(),
        })
      )
    ),
    citationIds: v.optional(v.array(v.id("citations"))),
  },
  returns: v.object({ reportId: v.id("literatureReports") }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Literature review session not found");

    const now = Date.now();
    const defaultContent =
      `# Literature review\n\n**Topic:** ${args.query}\n\n` +
      `Generated report for table \`${args.tableId}\`. ` +
      `This is an initial scaffold; refine prompts and LLM steps for full narrative synthesis.`;

    const content = args.content ?? defaultContent;
    const sections = args.sections ?? [{ heading: "Summary", content }];

    const sessionTitle = session.reviewTitle
      ? normalizeReviewTitle(session.reviewTitle)
      : fallbackReviewTitleFromQuery(session.query);
    const title = args.title
      ? literatureReportTitle(args.title)
      : literatureReportTitle(sessionTitle);

    const reportId = await ctx.db.insert("literatureReports", {
      title,
      notebookId: session.notebookId,
      userId: session.userId,
      status: args.status ?? "completed",
      content,
      citationStyle: "apa",
      sections,
      citationIds: args.citationIds ?? [],
      tableId: args.tableId,
      literatureReviewSessionId: args.sessionId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.sessionId, {
      reportId,
      updatedAt: now,
    });

    return { reportId };
  },
});

export const getReportById = internalQuery({
  args: {
    reportId: v.id("literatureReports"),
  },
  returns: v.union(
    v.object({
      title: v.string(),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
      content: v.string(),
      citationStyle: v.string(),
      sections: v.array(
        v.object({
          heading: v.string(),
          content: v.string(),
        })
      ),
      citationIds: v.array(v.id("citations")),
      tableId: v.optional(v.id("literatureTables")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    return {
      title: report.title,
      notebookId: report.notebookId,
      userId: report.userId,
      status: report.status,
      content: report.content,
      citationStyle: report.citationStyle,
      sections: report.sections,
      citationIds: report.citationIds,
      tableId: report.tableId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  },
});

export const patchWorkflowProvenance = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    patch: literatureReviewWorkflowProvenanceValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Literature review session not found");

    const existing = session.workflowProvenance ?? {};
    await ctx.db.patch(args.sessionId, {
      workflowProvenance: { ...existing, ...args.patch },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getWorkflowProvenance = internalQuery({
  args: { sessionId: v.id("literatureReviewSessions") },
  returns: v.union(literatureReviewWorkflowProvenanceValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    return session?.workflowProvenance ?? null;
  },
});

export const replaceScreeningDecisions = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    decisions: v.array(
      v.object({
        paperIndex: v.number(),
        title: v.string(),
        authors: v.array(v.string()),
        year: v.optional(v.number()),
        decision: v.union(v.literal("included"), v.literal("excluded")),
        reason: v.string(),
        rank: v.optional(v.number()),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("literatureReviewScreeningDecisions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    const now = Date.now();
    for (const d of args.decisions) {
      await ctx.db.insert("literatureReviewScreeningDecisions", {
        sessionId: args.sessionId,
        paperIndex: d.paperIndex,
        title: d.title,
        authors: d.authors,
        year: d.year,
        decision: d.decision,
        reason: d.reason,
        rank: d.rank,
        createdAt: now,
      });
    }
    return null;
  },
});

export const getScreeningDecisionsBySession = internalQuery({
  args: { sessionId: v.id("literatureReviewSessions") },
  returns: v.array(
    v.object({
      paperIndex: v.number(),
      title: v.string(),
      authors: v.array(v.string()),
      year: v.optional(v.number()),
      decision: v.union(v.literal("included"), v.literal("excluded")),
      reason: v.string(),
      rank: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("literatureReviewScreeningDecisions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return rows.map((r) => ({
      paperIndex: r.paperIndex,
      title: r.title,
      authors: r.authors,
      year: r.year,
      decision: r.decision,
      reason: r.reason,
      rank: r.rank,
    }));
  },
});

export const getSessionReportContext = internalQuery({
  args: { sessionId: v.id("literatureReviewSessions") },
  returns: v.union(
    v.object({
      query: v.string(),
      reviewTitle: v.optional(v.string()),
      workflowProvenance: literatureReviewWorkflowProvenanceValidator,
      confirmedColumns: v.optional(
        v.array(
          v.object({
            id: v.string(),
            name: v.string(),
            instructions: v.optional(v.string()),
            isVisible: v.boolean(),
          })
        )
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    return {
      query: session.query,
      reviewTitle: session.reviewTitle,
      workflowProvenance: session.workflowProvenance ?? {},
      confirmedColumns: session.confirmedColumns,
    };
  },
});
