import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";
import { mutation, query, internalMutation } from "../../_generated/server";
import { sendEvent, restart, type WorkflowId } from "@convex-dev/workflow";
import { components, internal } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import { assertCanEditNotebook, assertCanReadNotebook } from "../../_lib/notebookAccess";
import { workflow } from "../../_agents/literature_review/LiteratureReviewGraph.js";
import { literatureSearchOptionsValidator } from "../../_model/literatureReviewSearchOptions";
import { literatureReviewWorkflowProvenanceValidator } from "../../literatureReview/workflowProvenance";
import { resolveSmartModel } from "../../_lib/resolveSmartModel.js";
import type { QueryCtx } from "../../_generated/server";

/** Chat workflow tables/reports — never listed in the studio sidebar. */
async function getChatLinkedLiteratureArtifactIds(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">
): Promise<{
  tableIds: Set<Id<"literatureTables">>;
  reportIds: Set<Id<"literatureReports">>;
}> {
  const sessions = await ctx.db
    .query("literatureReviewSessions")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();

  const tableIds = new Set<Id<"literatureTables">>();
  const reportIds = new Set<Id<"literatureReports">>();
  for (const session of sessions) {
    if (session.tableId) tableIds.add(session.tableId);
    if (session.reportId) reportIds.add(session.reportId);
  }
  return { tableIds, reportIds };
}

function isChatLiteratureTableTitle(title: string): boolean {
  return title.startsWith("Literature table —") || title.startsWith("Literature table - ");
}

function isChatLiteratureReportTitle(title: string): boolean {
  return title.startsWith("Report —") || title.startsWith("Report - ");
}

function isChatLiteratureTable(
  table: {
    _id: Id<"literatureTables">;
    title: string;
    literatureReviewSessionId?: Id<"literatureReviewSessions">;
  },
  chatTableIds: Set<Id<"literatureTables">>
): boolean {
  return (
    table.literatureReviewSessionId !== undefined ||
    chatTableIds.has(table._id) ||
    isChatLiteratureTableTitle(table.title)
  );
}

function isChatLiteratureReport(
  report: {
    _id: Id<"literatureReports">;
    title: string;
    literatureReviewSessionId?: Id<"literatureReviewSessions">;
  },
  chatReportIds: Set<Id<"literatureReports">>
): boolean {
  return (
    report.literatureReviewSessionId !== undefined ||
    chatReportIds.has(report._id) ||
    isChatLiteratureReportTitle(report.title)
  );
}

/**
 * Confirm literature review columns and resume the workflow.
 *
 * Called by the frontend after the user accepts/edits the suggested columns.
 * Updates the session status and sends an event to resume the workflow.
 */
export const confirmLiteratureReviewColumns = mutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    confirmedColumns: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
        isVisible: v.boolean(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Literature review session not found: ${args.sessionId}`);
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to update this literature review session");
    }

    await assertCanEditNotebook(ctx, session.notebookId, userId);

    if (!session.workflowId) {
      throw new Error(`Session ${args.sessionId} does not have an associated workflowId`);
    }

    await ctx.db.patch(args.sessionId, {
      confirmedColumns: args.confirmedColumns,
      status: "searching",
      updatedAt: Date.now(),
    });

    await sendEvent(ctx, components.workflow, {
      name: "columnsConfirmed",
      workflowId: session.workflowId as WorkflowId,
      value: { confirmedColumns: args.confirmedColumns },
    });

    return null;
  },
});

/**
 * Internal mutation to update literature review session status.
 * Used by the workflow handler to mark sessions as failed on error.
 */
export const updateLiteratureReviewSessionStatus = internalMutation({
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
    error: v.optional(v.string()),
    suggestedColumns: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          instructions: v.optional(v.string()),
          isVisible: v.boolean(),
        })
      )
    ),
    reviewTitle: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.error !== undefined) updates.error = args.error;
    if (args.suggestedColumns !== undefined) updates.suggestedColumns = args.suggestedColumns;
    if (args.reviewTitle !== undefined) updates.reviewTitle = args.reviewTitle;
    await ctx.db.patch(args.sessionId, updates);
    return null;
  },
});

/**
 * Start a new literature review workflow.
 *
 * Creates a session record and kicks off the workflow.
 */
export const startLiteratureReview = mutation({
  args: {
    query: v.string(),
    notebookId: v.id("notebooks"),
    conversationId: v.optional(v.id("conversations")),
    searchOptions: v.optional(literatureSearchOptionsValidator),
    smartModel: v.optional(v.string()),
  },
  returns: v.object({
    sessionId: v.id("literatureReviewSessions"),
    conversationId: v.id("conversations"),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    const notebook = await ctx.db.get(args.notebookId);
    const notebookSmartModel = notebook?.chatSettings?.smartModel;
    const smartModel = resolveSmartModel(args.smartModel ?? notebookSmartModel);

    const now = Date.now();

    // Use the requested thread or start a fresh conversation (never reuse another thread).
    let conversationId: Id<"conversations">;
    if (args.conversationId) {
      const existing = await ctx.db.get(args.conversationId);
      if (!existing || existing.notebookId !== args.notebookId) {
        throw new Error("Invalid conversation for this notebook");
      }
      conversationId = existing._id;
    } else {
      conversationId = await ctx.db.insert("conversations", {
        userId,
        notebookId: args.notebookId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const conversation = await ctx.db.get(conversationId);
    if (!conversation?.title) {
      await ctx.scheduler.runAfter(0, internal.chat.actions.generateAndSetTitle, {
        conversationId,
        content: args.query,
      });
    }

    // Insert user message
    await ctx.runMutation(internal.chat.index.addMessage, {
      conversationId,
      role: "user",
      content: args.query,
    });

    // Insert assistant placeholder (will be updated as workflow progresses)
    const assistantMessageId: Id<"messages"> = await ctx.runMutation(
      internal.chat.index.addMessage,
      {
        conversationId,
        role: "assistant",
        content: `Starting a literature review on "${args.query}"...`,
        metadata: {
          isLiteratureReview: true,
          sessionId: "pending",
          status: "planning",
          query: args.query,
        },
      }
    );

    // Create session record linked to the conversation
    const sessionId: Id<"literatureReviewSessions"> = await ctx.db.insert(
      "literatureReviewSessions",
      {
        query: args.query,
        notebookId: args.notebookId,
        userId,
        workflowId: "", // Will be updated after workflow starts
        smartModel,
        searchOptions: args.searchOptions,
        status: "planning" as const,
        conversationId,
        assistantMessageId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    );

    // Patch the assistant message with the real sessionId
    await ctx.runMutation(internal.chat.index.updateMessageMetadata, {
      messageId: assistantMessageId,
      metadata: {
        isLiteratureReview: true,
        sessionId,
        status: "planning",
        query: args.query,
      },
    });

    // Start workflow
    const workflowId = await workflow.start(
      ctx,
      internal._agents.literature_review.LiteratureReviewGraph.literatureReviewWorkflow,
      {
        query: args.query,
        notebookId: args.notebookId,
        userId,
        sessionId,
        assistantMessageId,
        searchOptions: args.searchOptions,
        smartModel,
      }
    );

    // Update session with workflowId
    await ctx.db.patch(sessionId, {
      workflowId,
      updatedAt: Date.now(),
    });

    return { sessionId, conversationId };
  },
});

/**
 * Retry a failed literature review workflow from a specific step.
 *
 * Restarts the workflow using @convex-dev/workflow's restart() function,
 * defaulting to the extractData step. Already-extracted data in
 * literatureTableDrafts is preserved and skipped on resume.
 */
export const retryLiteratureReview = mutation({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    fromStep: v.optional(
      v.union(
        v.literal("planning"),
        v.literal("searching"),
        v.literal("deduplicating"),
        v.literal("ranking"),
        v.literal("screening"),
        v.literal("extracting"),
        v.literal("populating"),
        v.literal("generating_report")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Literature review session not found: ${args.sessionId}`);
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to retry this literature review session");
    }

    await assertCanEditNotebook(ctx, session.notebookId, userId);

    if (!session.workflowId) {
      throw new Error(`Session ${args.sessionId} does not have an associated workflowId`);
    }

    // Map step names to action references for restart()
    const stepMap: Record<string, FunctionReference<"action", "internal">> = {
      planning: internal.literatureReview.workflowSteps.planReview,
      searching: internal.literatureReview.workflowSteps.searchPapers,
      deduplicating: internal.literatureReview.workflowSteps.deduplicatePapers,
      ranking: internal.literatureReview.workflowSteps.rankPapers,
      screening: internal.literatureReview.workflowSteps.screenPapers,
      extracting: internal.literatureReview.workflowSteps.extractData,
      populating: internal.literatureReview.workflowSteps.generateTable,
      generating_report: internal.literatureReview.workflowSteps.generateReport,
    };

    // Determine which step to restart from
    // Default to extracting since that's the most expensive step and is idempotent
    let fromStep = args.fromStep ?? "extracting";

    // If no drafts exist yet, restart from an earlier step
    if (fromStep === "extracting") {
      const drafts = await ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .take(1);
      if (drafts.length === 0) {
        fromStep = "searching";
      }
    }

    const fromAction = stepMap[fromStep];
    if (!fromAction) {
      throw new Error(`Invalid fromStep: ${fromStep}`);
    }

    // Update session status before restart
    await ctx.db.patch(args.sessionId, {
      status: fromStep === "planning" ? "planning" : "searching",
      error: undefined,
      updatedAt: Date.now(),
    });

    // Restart the workflow from the specified step
    await restart(ctx, components.workflow, session.workflowId as WorkflowId, {
      from: fromAction,
    });

    return null;
  },
});

/**
 * Get a literature review session by ID.
 */
export const getLiteratureReviewSession = query({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.union(
    v.object({
      _id: v.id("literatureReviewSessions"),
      _creationTime: v.number(),
      query: v.string(),
      reviewTitle: v.optional(v.string()),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      workflowId: v.string(),
      smartModel: v.optional(v.string()),
      status: v.union(
        v.literal("planning"),
        v.literal("awaiting_columns"),
        v.literal("searching"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed")
      ),
      suggestedColumns: v.optional(
        v.array(
          v.object({
            id: v.string(),
            name: v.string(),
            instructions: v.optional(v.string()),
            isVisible: v.boolean(),
          })
        )
      ),
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
      error: v.optional(v.string()),
      tableId: v.optional(v.id("literatureTables")),
      reportId: v.optional(v.id("literatureReports")),
      conversationId: v.optional(v.id("conversations")),
      assistantMessageId: v.optional(v.id("messages")),
      searchOptions: v.optional(literatureSearchOptionsValidator),
      workflowProvenance: v.optional(literatureReviewWorkflowProvenanceValidator),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    if (session.userId !== userId) return null;

    try {
      await assertCanReadNotebook(ctx, session.notebookId, userId);
    } catch {
      return null;
    }

    return session;
  },
});

const citationMetadataValidator = v.object({
  title: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  doi: v.optional(v.string()),
  url: v.string(),
  pdfUrl: v.optional(v.string()),
  sourceApi: v.union(
    v.literal("openalex"),
    v.literal("arxiv"),
    v.literal("semantic_scholar"),
    v.literal("pubmed")
  ),
  citationCount: v.optional(v.number()),
  abstract: v.optional(v.string()),
});

const rankedPaperValidator = v.object({
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
});

/**
 * Ranked papers for a literature review session (papers panel).
 */
export const getRankedPapersForSession = query({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
  returns: v.union(
    v.object({
      sessionId: v.id("literatureReviewSessions"),
      query: v.string(),
      papers: v.array(rankedPaperValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) return null;

    try {
      await assertCanReadNotebook(ctx, session.notebookId, userId);
    } catch {
      return null;
    }

    const row = await ctx.db
      .query("literatureReviewRankedPapers")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!row) return null;

    return {
      sessionId: args.sessionId,
      query: session.query,
      papers: row.papers,
    };
  },
});

/**
 * Get a literature table by ID.
 */
export const getLiteratureTable = query({
  args: {
    tableId: v.id("literatureTables"),
  },
  returns: v.union(
    v.object({
      _id: v.id("literatureTables"),
      _creationTime: v.number(),
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
          citation: v.union(citationMetadataValidator, v.null()),
        })
      ),
      literatureReviewSessionId: v.optional(v.id("literatureReviewSessions")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const table = await ctx.db.get(args.tableId);
    if (!table) return null;

    if (table.userId !== userId) return null;

    try {
      await assertCanReadNotebook(ctx, table.notebookId, userId);
    } catch {
      return null;
    }

    const papers = await Promise.all(
      table.papers.map(async (paper) => {
        const citation = await ctx.db.get(paper.citationId);
        return {
          ...paper,
          citation: citation
            ? {
                title: citation.title,
                authors: citation.authors,
                year: citation.year,
                doi: citation.doi,
                url: citation.url,
                pdfUrl: citation.pdfUrl,
                sourceApi: citation.sourceApi,
                citationCount: citation.citationCount,
                abstract: citation.abstract,
              }
            : null,
        };
      })
    );

    return { ...table, papers };
  },
});

/**
 * Get a literature report by ID.
 */
export const getLiteratureReport = query({
  args: {
    reportId: v.id("literatureReports"),
  },
  returns: v.union(
    v.object({
      _id: v.id("literatureReports"),
      _creationTime: v.number(),
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
      literatureReviewSessionId: v.optional(v.id("literatureReviewSessions")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    if (report.userId !== userId) return null;

    try {
      await assertCanReadNotebook(ctx, report.notebookId, userId);
    } catch {
      return null;
    }

    return report;
  },
});

export const saveLiteratureReportAsStudioReport = mutation({
  args: {
    reportId: v.id("literatureReports"),
  },
  returns: v.id("reports"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Literature report not found");
    if (report.userId !== userId) throw new Error("Not authorized to save this literature report");

    await assertCanEditNotebook(ctx, report.notebookId, userId);

    const existingSavedReports = await ctx.db
      .query("reports")
      .withIndex("by_notebook_and_user", (q) =>
        q.eq("notebookId", report.notebookId).eq("userId", userId)
      )
      .collect();
    const existing = existingSavedReports.find(
      (saved) => saved.metadata?.sourceLiteratureReportId === args.reportId
    );
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("reports", {
      userId,
      notebookId: report.notebookId,
      title: report.title,
      content: report.content,
      reportType: "literature_review",
      status: "completed",
      metadata: {
        reportType: "literature_review",
        sourceLiteratureReportId: args.reportId,
        sourceLiteratureTableId: report.tableId,
        citationStyle: report.citationStyle,
        citationIds: report.citationIds,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Report plus resolved citations and session workflow provenance for the report UI.
 */
export const getLiteratureReportDetail = query({
  args: {
    reportId: v.id("literatureReports"),
  },
  returns: v.union(
    v.object({
      report: v.object({
        _id: v.id("literatureReports"),
        title: v.string(),
        content: v.string(),
        citationStyle: v.string(),
        sections: v.array(
          v.object({
            heading: v.string(),
            content: v.string(),
          })
        ),
        citationIds: v.array(v.id("citations")),
        literatureReviewSessionId: v.optional(v.id("literatureReviewSessions")),
      }),
      citations: v.record(
        v.string(),
        v.object({
          title: v.string(),
          authors: v.array(v.string()),
          year: v.optional(v.number()),
          url: v.string(),
        })
      ),
      workflowProvenance: v.optional(literatureReviewWorkflowProvenanceValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const report = await ctx.db.get(args.reportId);
    if (!report || report.userId !== userId) return null;

    try {
      await assertCanReadNotebook(ctx, report.notebookId, userId);
    } catch {
      return null;
    }

    const citations: Record<
      string,
      { title: string; authors: string[]; year?: number; url: string }
    > = {};
    for (const citationId of report.citationIds) {
      const citation = await ctx.db.get(citationId);
      if (!citation) continue;
      citations[citation.citationKey] = {
        title: citation.title,
        authors: citation.authors,
        year: citation.year,
        url: citation.url,
      };
    }

    let workflowProvenance:
      | {
          searchQueries?: string[];
          databasesUsed?: string[];
          recordsIdentified?: number;
          recordsAfterDedupe?: number;
          recordsRanked?: number;
          recordsScreened?: number;
          recordsIncluded?: number;
          recordsExcluded?: number;
          extractedRowCount?: number;
        }
      | undefined;

    if (report.literatureReviewSessionId) {
      const session = await ctx.db.get(report.literatureReviewSessionId);
      workflowProvenance = session?.workflowProvenance;
    }

    return {
      report: {
        _id: report._id,
        title: report.title,
        content: report.content,
        citationStyle: report.citationStyle,
        sections: report.sections,
        citationIds: report.citationIds,
        literatureReviewSessionId: report.literatureReviewSessionId,
      },
      citations,
      workflowProvenance,
    };
  },
});

/** Screening decisions for a literature review session (included + excluded). */
export const getLiteratureReviewScreeningDecisions = query({
  args: {
    sessionId: v.id("literatureReviewSessions"),
  },
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
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) return [];

    try {
      await assertCanReadNotebook(ctx, session.notebookId, userId);
    } catch {
      return [];
    }

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

/**
 * List all literature tables for a notebook.
 */
export const getLiteratureTablesByNotebook = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  returns: v.array(
    v.object({
      _id: v.id("literatureTables"),
      _creationTime: v.number(),
      title: v.string(),
      status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    const tables = await ctx.db
      .query("literatureTables")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .order("desc")
      .collect();

    const { tableIds: chatTableIds } = await getChatLinkedLiteratureArtifactIds(
      ctx,
      args.notebookId
    );
    const studioTables = tables.filter((t) => !isChatLiteratureTable(t, chatTableIds));

    return studioTables.map((t) => ({
      _id: t._id,
      _creationTime: t._creationTime,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  },
});

/**
 * List all literature reports for a notebook.
 */
export const getLiteratureReportsByNotebook = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  returns: v.array(
    v.object({
      _id: v.id("literatureReports"),
      _creationTime: v.number(),
      title: v.string(),
      status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    const reports = await ctx.db
      .query("literatureReports")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .order("desc")
      .collect();

    const { reportIds: chatReportIds } = await getChatLinkedLiteratureArtifactIds(
      ctx,
      args.notebookId
    );
    const studioReports = reports.filter((r) => !isChatLiteratureReport(r, chatReportIds));

    return studioReports.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
});
