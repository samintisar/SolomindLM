/**
 * LiteratureReviewGraph
 *
 * Orchestrates the literature review workflow using @convex-dev/workflow.
 *
 * Steps:
 * 1. Plan review (LLM suggests columns + search queries)
 * 2. Checkpoint: await user column confirmation via event
 * 3. Search papers (parallel across sources)
 * 4. Rank papers (ZeroEntropy; search step already dedupes)
 * 5. Screen papers (top 30, batch 5)
 * 6. Extract data (batch 5, write to literatureTableDrafts)
 * 7. Generate table
 * 8. Generate report
 */

import { defineEvent, type WorkflowCtx, WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import {
  EXTRACT_DATA_CHUNK_SIZE,
  SCREEN_PAPERS_BATCH_SIZE,
} from "../../literatureReview/batchSizes.js";
import { LITERATURE_SCREEN_TOP_N } from "../../literatureReview/llmTuning.js";
import {
  literatureSearchOptionsValidator,
  sourcesForResearchDatabase,
} from "../../_model/literatureReviewSearchOptions";

export const workflow = new WorkflowManager(components.workflow);

// Shared event definition for column confirmation
const columnsConfirmedEvent = defineEvent({
  name: "columnsConfirmed",
  validator: v.object({
    confirmedColumns: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
        isVisible: v.boolean(),
      })
    ),
  }),
});

async function trackStep(
  step: WorkflowCtx,
  researchId: string,
  stepType:
    | "planning"
    | "searching"
    | "deduplicating"
    | "ranking"
    | "screening"
    | "extracting"
    | "populating"
    | "generating_report"
    | "awaiting_user_input",
  status: "pending" | "in_progress" | "completed" | "failed",
  details?: string,
  metadata?: Record<string, unknown>
) {
  const orderMap: Record<typeof stepType, number> = {
    planning: 0,
    searching: 1,
    deduplicating: 2,
    ranking: 3,
    screening: 4,
    extracting: 5,
    populating: 6,
    generating_report: 7,
    awaiting_user_input: 8,
  };

  await step.runMutation(internal.research.index.upsertResearchStep, {
    researchId,
    agentType: "literature_review",
    stepType,
    status,
    details,
    metadata,
    order: orderMap[stepType],
  });
}

export const literatureReviewWorkflow = workflow
  .define({
    args: {
      query: v.string(),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      sessionId: v.id("literatureReviewSessions"),
      assistantMessageId: v.id("messages"),
      searchOptions: v.optional(literatureSearchOptionsValidator),
      smartModel: v.optional(v.string()),
    },
    returns: v.object({
      tableId: v.id("literatureTables"),
      reportId: v.id("literatureReports"),
    }),
  })
  .handler(async (step, args) => {
    try {
      // Step 1: Plan review (returns searchQueries + suggestedColumns)
      await trackStep(
        step,
        args.sessionId,
        "planning",
        "in_progress",
        "Planning literature review strategy"
      );
      const plan = await step.runAction(internal.literatureReview.workflowSteps.planReview, {
        query: args.query,
        smartModel: args.smartModel,
      });
      const planQueries =
        plan.searchQueries.length > 0
          ? plan.searchQueries
          : [args.query.trim()].filter((q) => q.length > 0);
      await trackStep(
        step,
        args.sessionId,
        "planning",
        "completed",
        planQueries.length > 0
          ? planQueries.join("\n")
          : `Generated search strategy with ${plan.searchQueries.length} queries`,
        { searchQueries: planQueries }
      );

      // Save plan results and update session status so frontend shows column picker
      await step.runMutation(
        internal.studio.literature_tables.index.updateLiteratureReviewSessionStatus,
        {
          sessionId: args.sessionId,
          status: "awaiting_columns",
          suggestedColumns: plan.suggestedColumns,
          reviewTitle: plan.reviewTitle,
        }
      );

      // Update chat message to reflect awaiting column confirmation
      await step.runMutation(internal.chat.index.updateMessageMetadata, {
        messageId: args.assistantMessageId,
        metadata: {
          isLiteratureReview: true,
          sessionId: args.sessionId,
          status: "awaiting_columns",
          query: args.query,
          suggestedColumns: plan.suggestedColumns,
        },
      });

      // Checkpoint: await user column confirmation
      await trackStep(
        step,
        args.sessionId,
        "awaiting_user_input",
        "in_progress",
        "Waiting for user to confirm extraction columns"
      );
      const { confirmedColumns } = await step.awaitEvent(columnsConfirmedEvent);
      await trackStep(
        step,
        args.sessionId,
        "awaiting_user_input",
        "completed",
        `Confirmed ${confirmedColumns.length} columns`
      );

      // Step 2: Search papers (parallel across sources)
      const searchQueriesUsed =
        plan.searchQueries.length > 0
          ? plan.searchQueries
          : [args.query.trim()].filter((q) => q.length > 0);
      const searchQueriesDetail = searchQueriesUsed.join("\n");
      const searchStepMetadata = { searchQueries: searchQueriesUsed };

      await trackStep(
        step,
        args.sessionId,
        "searching",
        "in_progress",
        searchQueriesDetail,
        searchStepMetadata
      );
      const searchResults = await step.runAction(
        internal.literatureReview.workflowSteps.searchPapers,
        {
          query: args.query,
          searchQueries: plan.searchQueries,
          searchOptions: args.searchOptions,
        }
      );
      const dbSources = args.searchOptions
        ? sourcesForResearchDatabase(args.searchOptions.researchDatabase)
        : ["arxiv", "semantic_scholar", "pubmed"];
      await step.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
        sessionId: args.sessionId,
        patch: {
          searchQueries: searchQueriesUsed,
          databasesUsed: dbSources,
          recordsIdentified: searchResults.recordsIdentified,
          recordsAfterDedupe: searchResults.recordsAfterDedupe,
          searchCompletedAt: Date.now(),
        },
      });

      await trackStep(step, args.sessionId, "searching", "completed", searchQueriesDetail, {
        ...searchStepMetadata,
        papersFound: searchResults.papers.length,
        recordsIdentified: searchResults.recordsIdentified,
        recordsAfterDedupe: searchResults.recordsAfterDedupe,
      });

      await trackStep(
        step,
        args.sessionId,
        "deduplicating",
        "completed",
        `${searchResults.recordsAfterDedupe} unique papers after deduplication (from ${searchResults.recordsIdentified} identified)`
      );

      // Step 3: Rank (ZeroEntropy)
      await trackStep(
        step,
        args.sessionId,
        "ranking",
        "in_progress",
        "Ranking papers by relevance"
      );
      const ranked = await step.runAction(internal.literatureReview.workflowSteps.rankPapers, {
        papers: searchResults.papers,
        query: args.query,
      });
      await step.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
        sessionId: args.sessionId,
        patch: {
          recordsRanked: ranked.papers.length,
          rankCompletedAt: Date.now(),
        },
      });

      await trackStep(
        step,
        args.sessionId,
        "ranking",
        "completed",
        `Ranked ${ranked.papers.length} papers for your research question.`,
        { recordsRanked: ranked.papers.length }
      );

      await step.runMutation(internal.literatureReview.db.persistRankedPapers, {
        sessionId: args.sessionId,
        papers: ranked.papers,
      });

      // Step 5: Screen (top 30) — one workflow step per batch (each gets its own action limit)
      const papersToScreen = ranked.papers.slice(0, LITERATURE_SCREEN_TOP_N);
      await trackStep(
        step,
        args.sessionId,
        "screening",
        "in_progress",
        `Screening top ${papersToScreen.length} papers`
      );

      const screeningDecisions = new Map<number, { isIncluded: boolean; reason: string }>();
      for (let i = 0; i < papersToScreen.length; i += SCREEN_PAPERS_BATCH_SIZE) {
        const batch = papersToScreen.slice(i, i + SCREEN_PAPERS_BATCH_SIZE);
        const { decisions } = await step.runAction(
          internal.literatureReview.workflowSteps.screenPapersBatch,
          {
            papers: batch,
            query: args.query,
            batchStartIndex: i,
            smartModel: args.smartModel,
          }
        );
        for (const decision of decisions) {
          screeningDecisions.set(decision.paperIndex, {
            isIncluded: decision.isIncluded,
            reason: decision.reason,
          });
        }
      }

      const screened = {
        papers: papersToScreen.map(
          (
            p: {
              title: string;
              authors: string[];
              year?: number;
              abstract: string;
              url: string;
              source: string;
              score: number;
              isIncluded?: boolean;
              includeReason?: string;
            },
            index: number
          ) => ({
            ...p,
            isIncluded: screeningDecisions.get(index)?.isIncluded ?? true,
            includeReason:
              screeningDecisions.get(index)?.reason ?? "No screening decision available.",
          })
        ),
      };

      const includedCount = screened.papers.filter(
        (p: { isIncluded?: boolean }) => p.isIncluded === true
      ).length;
      const excludedCount = screened.papers.length - includedCount;

      await step.runMutation(internal.literatureReview.db.replaceScreeningDecisions, {
        sessionId: args.sessionId,
        decisions: screened.papers.map(
          (
            p: {
              title: string;
              authors: string[];
              year?: number;
              isIncluded?: boolean;
              includeReason?: string;
            },
            i: number
          ) => ({
            paperIndex: i,
            title: p.title,
            authors: p.authors,
            year: p.year,
            decision: p.isIncluded === true ? ("included" as const) : ("excluded" as const),
            reason: p.includeReason ?? "No reason recorded.",
            rank: i + 1,
          })
        ),
      });

      await step.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
        sessionId: args.sessionId,
        patch: {
          recordsScreened: screened.papers.length,
          recordsIncluded: includedCount,
          recordsExcluded: excludedCount,
          screenCompletedAt: Date.now(),
        },
      });

      await trackStep(
        step,
        args.sessionId,
        "screening",
        "completed",
        `Screened ${screened.papers.length} papers: ${includedCount} included, ${excludedCount} excluded.`,
        {
          recordsScreened: screened.papers.length,
          recordsIncluded: includedCount,
          recordsExcluded: excludedCount,
        }
      );

      // Step 6: Extract data (batch 5, write to literatureTableDrafts)
      const includedPapers = screened.papers.filter(
        (p: { isIncluded?: boolean }) => p.isIncluded === true
      );
      const existingBatchNumbers = await step.runQuery(
        internal.literatureReview.db.getExistingBatchNumbers,
        { sessionId: args.sessionId }
      );
      const existingBatchSet = new Set(existingBatchNumbers);
      const extractBatchCount =
        Math.ceil(includedPapers.length / EXTRACT_DATA_CHUNK_SIZE) || 0;

      await trackStep(
        step,
        args.sessionId,
        "extracting",
        "in_progress",
        "Extracting data from included papers"
      );

      for (let b = 0; b < includedPapers.length; b += EXTRACT_DATA_CHUNK_SIZE) {
        const batchNumber = Math.floor(b / EXTRACT_DATA_CHUNK_SIZE);
        if (existingBatchSet.has(batchNumber)) {
          continue;
        }
        const batchPapers = includedPapers.slice(b, b + EXTRACT_DATA_CHUNK_SIZE);
        await step.runAction(internal.literatureReview.workflowSteps.extractDataBatch, {
          papers: batchPapers,
          columns: confirmedColumns,
          sessionId: args.sessionId,
          batchNumber,
          query: args.query,
          smartModel: args.smartModel,
        });
      }
      const draftCount = await step.runQuery(internal.literatureReview.db.getDraftsBySession, {
        sessionId: args.sessionId,
      });
      await step.runMutation(internal.literatureReview.db.patchWorkflowProvenance, {
        sessionId: args.sessionId,
        patch: {
          extractedRowCount: draftCount.length,
          extractCompletedAt: Date.now(),
        },
      });

      await trackStep(
        step,
        args.sessionId,
        "extracting",
        "completed",
        `Extracted data from ${includedCount} papers`,
        { extractedRowCount: draftCount.length }
      );

      // Step 7: Generate table
      await trackStep(
        step,
        args.sessionId,
        "populating",
        "in_progress",
        "Building literature table"
      );
      const table = await step.runAction(internal.literatureReview.workflowSteps.generateTable, {
        sessionId: args.sessionId,
        columns: confirmedColumns,
      });
      await trackStep(step, args.sessionId, "populating", "completed");

      // Step 8: Generate report
      await trackStep(
        step,
        args.sessionId,
        "generating_report",
        "in_progress",
        "Writing literature review report"
      );
      const report = await step.runAction(internal.literatureReview.workflowSteps.generateReport, {
        sessionId: args.sessionId,
        tableId: table.tableId,
        query: args.query,
        smartModel: args.smartModel,
      });
      await trackStep(step, args.sessionId, "generating_report", "completed", "Report generated");

      // Mark session as completed
      await step.runMutation(
        internal.studio.literature_tables.index.updateLiteratureReviewSessionStatus,
        {
          sessionId: args.sessionId,
          status: "completed",
        }
      );

      // Update chat message with final results
      await step.runMutation(internal.chat.index.updateMessageMetadata, {
        messageId: args.assistantMessageId,
        metadata: {
          isLiteratureReview: true,
          sessionId: args.sessionId,
          status: "completed",
          query: args.query,
          tableId: table.tableId,
          reportId: report.reportId,
        },
      });

      return { tableId: table.tableId, reportId: report.reportId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      await step.runMutation(
        internal.studio.literature_tables.index.updateLiteratureReviewSessionStatus,
        {
          sessionId: args.sessionId,
          status: "failed",
          error: errorMessage,
        }
      );

      // Update chat message to reflect failure
      await step.runMutation(internal.chat.index.updateMessageMetadata, {
        messageId: args.assistantMessageId,
        metadata: {
          isLiteratureReview: true,
          sessionId: args.sessionId,
          status: "failed",
          query: args.query,
          error: errorMessage,
        },
      });

      throw error;
    }
  });

// Re-export event definition so mutations can reference it
export { columnsConfirmedEvent };
