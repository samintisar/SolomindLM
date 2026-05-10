import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

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

      const rowData: Record<string, string> = {};
      const values = [
        paper.title,
        paper.authors.join(", "),
        paper.year !== undefined ? String(paper.year) : "",
        paper.abstract.slice(0, 2000),
      ];
      args.columns.forEach((col, idx) => {
        rowData[col.id] = values[idx] ?? "";
      });

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

    const tableId = await ctx.db.insert("literatureTables", {
      title: `Literature table — ${session.query.slice(0, 80)}`,
      description: undefined,
      notebookId: session.notebookId,
      userId: session.userId,
      status: "completed",
      columns: tableColumns,
      papers,
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
      columns: v.array(v.object({
        id: v.string(),
        name: v.string(),
        type: v.union(v.literal("paper_title"), v.literal("authors"), v.literal("year"), v.literal("study_type"), v.literal("custom")),
        instructions: v.optional(v.string()),
        isVisible: v.boolean(),
        isSystem: v.boolean(),
        order: v.number(),
      })),
      papers: v.array(v.object({
        citationId: v.id("citations"),
        rowData: v.record(v.string(), v.string()),
        includeReason: v.optional(v.string()),
        isIncluded: v.boolean(),
      })),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tableId);
  },
});

export const getDraftsBySession = internalQuery({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.array(v.object({
    citationId: v.id("citations"),
    rowData: v.record(v.string(), v.string()),
    includeReason: v.optional(v.string()),
    isIncluded: v.boolean(),
    batchNumber: v.number(),
  })),
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

export const getCitationsByIds = internalQuery({
  args: {
    citationIds: v.array(v.id("citations")),
  },
  returns: v.array(v.object({
    _id: v.id("citations"),
    title: v.string(),
    authors: v.array(v.string()),
    year: v.optional(v.number()),
    citationKey: v.string(),
    doi: v.optional(v.string()),
    url: v.string(),
    abstract: v.optional(v.string()),
  })),
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
export const persistReport = internalMutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    tableId: v.id("literatureTables"),
    query: v.string(),
    content: v.optional(v.string()),
    sections: v.optional(v.array(v.object({
      heading: v.string(),
      content: v.string(),
    }))),
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

    const reportId = await ctx.db.insert("literatureReports", {
      title: `Report — ${args.query.slice(0, 80)}`,
      notebookId: session.notebookId,
      userId: session.userId,
      status: "completed",
      content,
      citationStyle: "apa",
      sections,
      citationIds: args.citationIds ?? [],
      tableId: args.tableId,
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
