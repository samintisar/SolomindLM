"use node";
/**
 * LiteratureReviewGraph
 *
 * Orchestrates the literature review workflow using @convex-dev/workflow.
 *
 * Steps:
 * 1. Plan review (LLM suggests columns + search queries)
 * 2. Checkpoint: await user column confirmation via event
 * 3. Search papers (parallel across sources)
 * 4. Deduplicate papers
 * 5. Rank papers (ZeroEntropy)
 * 6. Screen papers (top 30, batch 5)
 * 7. Extract data (batch 5, write to literatureTableDrafts)
 * 8. Generate table
 * 9. Generate report
 */

import { WorkflowManager, defineEvent } from "@convex-dev/workflow";
import { components } from "../../_generated/api";
import { v } from "convex/values";
import { internal } from "../../_generated/api";

// TODO: Run `npx convex dev` to regenerate types so components.workflow is available
export const workflow = new WorkflowManager(
  (components as any).workflow
);

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

export const literatureReviewWorkflow = workflow
  .define({
    args: {
      query: v.string(),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      sessionId: v.id("literatureReviewSessions"),
    },
    returns: v.object({
      tableId: v.id("literatureTables"),
      reportId: v.id("literatureReports"),
    }),
  })
  .handler(async (step, args) => {
    // Step 1: Plan review (returns searchQueries + suggestedColumns)
    // TODO: Update path once planReview action is created in Task 5
    const plan = await step.runAction(
      (internal as any).literatureReview.planReview,
      {
        query: args.query,
      }
    );

    // Checkpoint: await user column confirmation
    const { confirmedColumns } = await step.awaitEvent(columnsConfirmedEvent);

    // Step 2: Search papers (parallel across sources)
    // TODO: Update path once searchPapers action is created in Task 5
    const searchResults = await step.runAction(
      (internal as any).literatureReview.searchPapers,
      {
        query: args.query,
        searchQueries: plan.searchQueries,
      }
    );

    // Step 3: Deduplicate
    // TODO: Update path once deduplicatePapers action is created in Task 5
    const deduped = await step.runAction(
      (internal as any).literatureReview.deduplicatePapers,
      {
        papers: searchResults.papers,
      }
    );

    // Step 4: Rank (ZeroEntropy)
    // TODO: Update path once rankPapers action is created in Task 5
    const ranked = await step.runAction(
      (internal as any).literatureReview.rankPapers,
      {
        papers: deduped.papers,
        query: args.query,
      }
    );

    // Step 5: Screen (top 30)
    // TODO: Update path once screenPapers action is created in Task 5
    const screened = await step.runAction(
      (internal as any).literatureReview.screenPapers,
      {
        papers: ranked.papers.slice(0, 30),
        query: args.query,
      }
    );

    // Step 6: Extract data (batch 5, write to literatureTableDrafts)
    // TODO: Update path once extractData action is created in Task 5
    await step.runAction(
      (internal as any).literatureReview.extractData,
      {
        papers: screened.papers.filter((p: any) => p.isIncluded),
        columns: confirmedColumns,
        sessionId: args.sessionId,
      }
    );

    // Step 7: Generate table
    // TODO: Update path once generateTable action is created in Task 5
    const table = await step.runAction(
      (internal as any).literatureReview.generateTable,
      {
        sessionId: args.sessionId,
        columns: confirmedColumns,
      }
    );

    // Step 8: Generate report
    // TODO: Update path once generateReport action is created in Task 5
    const report = await step.runAction(
      (internal as any).literatureReview.generateReport,
      {
        sessionId: args.sessionId,
        tableId: table.tableId,
        query: args.query,
      }
    );

    return { tableId: table.tableId, reportId: report.reportId };
  });

// Re-export event definition so mutations can reference it
export { columnsConfirmedEvent };
