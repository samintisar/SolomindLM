/**
 * Convex action for running the literature review workflow in eval mode.
 *
 * The production workflow pauses for column confirmation. Eval mode runs the
 * same workflow steps inline and auto-confirms the planner's suggested columns
 * so it can run unattended from the RAG eval CLI.
 */
"use node";

import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { literatureReviewWorkflowProvenanceValidator } from "../literatureReview/workflowProvenance";
import { assertRagEvalGate } from "./_gate";

type EvalActionCtx = GenericActionCtx<DataModel>;

const confirmedColumnValidator = v.object({
  id: v.string(),
  name: v.string(),
  instructions: v.optional(v.string()),
  isVisible: v.boolean(),
});

const evalPaperValidator = v.object({
  rowData: v.record(v.string(), v.string()),
  includeReason: v.optional(v.string()),
  isIncluded: v.boolean(),
});

const evalTableValidator = v.object({
  title: v.string(),
  columns: v.array(v.object({ id: v.string(), name: v.string() })),
  papers: v.array(evalPaperValidator),
});

const evalReportValidator = v.object({
  title: v.string(),
  content: v.string(),
  sections: v.array(v.object({ heading: v.string(), content: v.string() })),
});

const stagePaperValidator = v.object({
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
});

const screeningDecisionValidator = v.object({
  title: v.string(),
  isIncluded: v.boolean(),
  reason: v.optional(v.string()),
});

const extractionCoverageValidator = v.object({
  columnId: v.string(),
  columnName: v.string(),
  filledCount: v.number(),
  totalCount: v.number(),
  coverageRatio: v.number(),
});

const extractionSampleValidator = v.object({
  paperTitle: v.string(),
  columnName: v.string(),
  extractedValue: v.string(),
});

const DEFAULT_COLUMNS = [
  {
    id: "title",
    name: "Title",
    instructions: "Paper title",
    isVisible: true,
  },
  {
    id: "authors",
    name: "Authors",
    instructions: "Primary authors",
    isVisible: true,
  },
  {
    id: "year",
    name: "Year",
    instructions: "Publication year",
    isVisible: true,
  },
  {
    id: "summary",
    name: "Summary",
    instructions: "Short summary of the abstract and relevance",
    isVisible: true,
  },
] as const;

interface NotebookOwner {
  userId: Id<"users">;
}

interface ConfirmedColumn {
  id: string;
  name: string;
  instructions?: string;
  isVisible: boolean;
}

interface LiteraturePaper {
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
  isIncluded?: boolean;
  includeReason?: string;
}

interface LiteratureReviewEvalResult {
  sessionId: string;
  tableId: string;
  reportId: string;
  searchQueries: string[];
  confirmedColumns: ConfirmedColumn[];
  counts: {
    found: number;
    deduplicated: number;
    screened: number;
    included: number;
    extractedRows: number;
  };
  stagePapers: {
    search: LiteraturePaper[];
    deduped: LiteraturePaper[];
    ranked: LiteraturePaper[];
    screened: LiteraturePaper[];
  };
  screeningDecisions: Array<{
    title: string;
    isIncluded: boolean;
    reason?: string;
  }>;
  extractionCoverage: Array<{
    columnId: string;
    columnName: string;
    filledCount: number;
    totalCount: number;
    coverageRatio: number;
  }>;
  extractionSamples: Array<{
    paperTitle: string;
    columnName: string;
    extractedValue: string;
  }>;
  table: {
    title: string;
    columns: Array<{ id: string; name: string }>;
    papers: Array<{
      rowData: Record<string, string>;
      includeReason?: string;
      isIncluded: boolean;
    }>;
  };
  report: {
    title: string;
    content: string;
    sections: Array<{ heading: string; content: string }>;
  };
  workflowProvenance: import("../literatureReview/workflowProvenance").LiteratureReviewWorkflowProvenance;
  latencyMs: number;
}

async function resolveNotebookOwner(
  ctx: EvalActionCtx,
  notebookId: Id<"notebooks">
): Promise<NotebookOwner> {
  const notebook = await ctx.runQuery(internal.notebooks.index.getNotebookInternal, {
    notebookId,
  });
  if (!notebook) {
    throw new Error(
      `Notebook ${notebookId} not found on this Convex deployment. ` +
        `Verify RAG_EVAL_CONVEX_URL points at the deployment that owns this notebook.`
    );
  }
  return { userId: notebook.userId as Id<"users"> };
}

function normalizeConfirmedColumns(
  suggestedColumns: Array<{ id: string; name: string; instructions?: string; isVisible?: boolean }>
): ConfirmedColumn[] {
  const source = suggestedColumns.length > 0 ? suggestedColumns : [...DEFAULT_COLUMNS];
  return source.map((column, index) => ({
    id: column.id || `column_${index + 1}`,
    name: column.name || `Column ${index + 1}`,
    ...(column.instructions ? { instructions: column.instructions } : {}),
    isVisible: column.isVisible ?? true,
  }));
}

function toSuggestedColumns(
  columns: Array<{ id: string; name: string; instructions?: string; isVisible: boolean }>
): Array<{ id: string; name: string; instructions?: string; isVisible: boolean }> {
  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    isVisible: column.isVisible,
    ...(column.instructions ? { instructions: column.instructions } : {}),
  }));
}

export const runLiteratureReviewEval = action({
  args: {
    evalSecret: v.string(),
    question: v.string(),
    notebookId: v.id("notebooks"),
  },
  returns: v.object({
    sessionId: v.string(),
    tableId: v.string(),
    reportId: v.string(),
    searchQueries: v.array(v.string()),
    confirmedColumns: v.array(confirmedColumnValidator),
    counts: v.object({
      found: v.number(),
      deduplicated: v.number(),
      screened: v.number(),
      included: v.number(),
      extractedRows: v.number(),
    }),
    stagePapers: v.object({
      search: v.array(stagePaperValidator),
      deduped: v.array(stagePaperValidator),
      ranked: v.array(stagePaperValidator),
      screened: v.array(stagePaperValidator),
    }),
    screeningDecisions: v.array(screeningDecisionValidator),
    extractionCoverage: v.array(extractionCoverageValidator),
    extractionSamples: v.array(extractionSampleValidator),
    table: evalTableValidator,
    report: evalReportValidator,
    workflowProvenance: literatureReviewWorkflowProvenanceValidator,
    latencyMs: v.number(),
  }),
  handler: async (ctx, args): Promise<LiteratureReviewEvalResult> => {
    assertRagEvalGate(args.evalSecret);
    const startTime = Date.now();
    const { userId } = await resolveNotebookOwner(ctx, args.notebookId);

    const plan: { searchQueries: string[]; suggestedColumns: ConfirmedColumn[] } =
      await ctx.runAction(internal.literatureReview.workflowSteps.planReview, {
        query: args.question,
      });
    const confirmedColumns: ConfirmedColumn[] = normalizeConfirmedColumns(plan.suggestedColumns);
    const suggestedColumns = toSuggestedColumns(confirmedColumns);
    const sessionId: Id<"literatureReviewSessions"> = await ctx.runMutation(
      internal.literatureReview.db.createEvalSession,
      {
        query: args.question,
        notebookId: args.notebookId,
        userId,
        suggestedColumns,
        confirmedColumns,
      }
    );

    const searchResults: {
      papers: LiteraturePaper[];
      recordsIdentified: number;
      recordsAfterDedupe: number;
    } = await ctx.runAction(internal.literatureReview.workflowSteps.searchPapers, {
      query: args.question,
      searchQueries: plan.searchQueries,
    });

    await ctx.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
      sessionId,
      patch: {
        searchQueries: plan.searchQueries,
        databasesUsed: ["arxiv", "semantic_scholar", "pubmed"],
        recordsIdentified: searchResults.recordsIdentified,
        recordsAfterDedupe: searchResults.recordsAfterDedupe,
        searchCompletedAt: Date.now(),
      },
    });

    const deduped: { papers: LiteraturePaper[] } = await ctx.runAction(
      internal.literatureReview.workflowSteps.deduplicatePapers,
      {
        papers: searchResults.papers,
      }
    );
    const ranked: { papers: LiteraturePaper[] } = await ctx.runAction(
      internal.literatureReview.workflowSteps.rankPapers,
      {
        papers: deduped.papers,
        query: args.question,
      }
    );

    await ctx.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
      sessionId,
      patch: {
        recordsRanked: ranked.papers.length,
        rankCompletedAt: Date.now(),
      },
    });

    const screened: { papers: LiteraturePaper[] } = await ctx.runAction(
      internal.literatureReview.workflowSteps.screenPapers,
      {
        papers: ranked.papers.slice(0, 25),
        query: args.question,
      }
    );
    const includedPapers = screened.papers.filter(
      (paper: LiteraturePaper) => paper.isIncluded === true
    );
    const excludedCount = screened.papers.length - includedPapers.length;

    await ctx.runMutation(internal.literatureReview.db.replaceScreeningDecisions, {
      sessionId,
      decisions: screened.papers.map((paper, i) => ({
        paperIndex: i,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        decision: paper.isIncluded === true ? ("included" as const) : ("excluded" as const),
        reason: paper.includeReason ?? "No reason recorded.",
        rank: i + 1,
      })),
    });

    await ctx.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
      sessionId,
      patch: {
        recordsScreened: screened.papers.length,
        recordsIncluded: includedPapers.length,
        recordsExcluded: excludedCount,
        screenCompletedAt: Date.now(),
      },
    });

    await ctx.runAction(internal.literatureReview.workflowSteps.extractData, {
      papers: includedPapers.slice(0, 25),
      columns: confirmedColumns,
      sessionId,
    });
    const tableResult: { tableId: Id<"literatureTables"> } = await ctx.runAction(
      internal.literatureReview.workflowSteps.generateTable,
      {
        sessionId,
        columns: confirmedColumns,
      }
    );
    const reportResult: { reportId: Id<"literatureReports"> } = await ctx.runAction(
      internal.literatureReview.workflowSteps.generateReport,
      {
        sessionId,
        tableId: tableResult.tableId,
        query: args.question,
      }
    );

    const table: {
      title: string;
      columns: Array<{ id: string; name: string }>;
      papers: Array<{
        rowData: Record<string, string>;
        includeReason?: string;
        isIncluded: boolean;
      }>;
    } | null = await ctx.runQuery(internal.literatureReview.db.getTableById, {
      tableId: tableResult.tableId,
    });
    const report: {
      title: string;
      content: string;
      sections: Array<{ heading: string; content: string }>;
    } | null = await ctx.runQuery(internal.literatureReview.db.getReportById, {
      reportId: reportResult.reportId,
    });
    if (!table) throw new Error(`Literature table ${tableResult.tableId} not found after eval`);
    if (!report) throw new Error(`Literature report ${reportResult.reportId} not found after eval`);

    await ctx.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
      sessionId,
      patch: {
        extractedRowCount: table.papers.length,
        extractCompletedAt: Date.now(),
      },
    });

    await ctx.runMutation(internal.literatureReview.db.completeEvalSession, {
      sessionId,
    });

    const workflowProvenance =
      (await ctx.runQuery(internal.literatureReview.db.getWorkflowProvenance, {
        sessionId,
      })) ?? {};

    // Compute extraction coverage
    const customColumnIds = confirmedColumns
      .filter((c) => !["title", "authors", "year", "summary"].includes(c.id))
      .map((c) => c.id);
    const extractionCoverage = customColumnIds.map((columnId) => {
      const column = confirmedColumns.find((c) => c.id === columnId);
      const filledCount = table.papers.filter((p) => {
        const val = p.rowData[columnId];
        return val !== undefined && val.trim().length > 0 && val !== "N/A";
      }).length;
      const totalCount = table.papers.length;
      return {
        columnId,
        columnName: column?.name ?? columnId,
        filledCount,
        totalCount,
        coverageRatio: totalCount === 0 ? 0 : filledCount / totalCount,
      };
    });

    // Sample extracted data for LLM-judge evaluation
    const extractionSamples: Array<{
      paperTitle: string;
      columnName: string;
      extractedValue: string;
    }> = [];
    const samplePapers = table.papers.slice(0, 3);
    const sampleColumns = confirmedColumns.slice(0, 3);
    for (const paper of samplePapers) {
      for (const col of sampleColumns) {
        const val = paper.rowData[col.id];
        if (val !== undefined && val.trim().length > 0) {
          extractionSamples.push({
            paperTitle: paper.rowData["title"] ?? "Unknown",
            columnName: col.name,
            extractedValue: val,
          });
        }
      }
    }

    const truncateAbstract = (paper: LiteraturePaper) => ({
      ...paper,
      abstract: paper.abstract.length > 500 ? paper.abstract.slice(0, 500) + "..." : paper.abstract,
    });

    const truncateContent = (content: string, maxLen = 15000) =>
      content.length > maxLen ? content.slice(0, maxLen) + "..." : content;

    return {
      sessionId,
      tableId: tableResult.tableId,
      reportId: reportResult.reportId,
      searchQueries: plan.searchQueries,
      confirmedColumns,
      counts: {
        found: searchResults.recordsIdentified,
        deduplicated: searchResults.recordsAfterDedupe,
        screened: screened.papers.length,
        included: includedPapers.length,
        extractedRows: table.papers.length,
      },
      workflowProvenance,
      stagePapers: {
        search: searchResults.papers.slice(0, 10).map(truncateAbstract),
        deduped: deduped.papers.slice(0, 10).map(truncateAbstract),
        ranked: ranked.papers.slice(0, 10).map(truncateAbstract),
        screened: screened.papers.slice(0, 10).map(truncateAbstract),
      },
      screeningDecisions: screened.papers.map((p) => ({
        title: p.title,
        isIncluded: p.isIncluded ?? true,
        reason: p.includeReason,
      })),
      extractionCoverage,
      extractionSamples,
      table: {
        title: table.title,
        columns: table.columns.map((column: { id: string; name: string }) => ({
          id: column.id,
          name: column.name,
        })),
        papers: table.papers.map(
          (paper: {
            rowData: Record<string, string>;
            includeReason?: string;
            isIncluded: boolean;
          }) => ({
            rowData: paper.rowData,
            ...(paper.includeReason ? { includeReason: paper.includeReason } : {}),
            isIncluded: paper.isIncluded,
          })
        ),
      },
      report: {
        title: report.title,
        content: truncateContent(report.content),
        sections: report.sections.map((s) => ({
          heading: s.heading,
          content: truncateContent(s.content, 4000),
        })),
      },
      latencyMs: Date.now() - startTime,
    };
  },
});
