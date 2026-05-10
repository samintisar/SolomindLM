"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps } from "../types";
import { trackResearchStep } from "../../research/steps";

/**
 * generateTable node: Create literatureTables row from extracted data.
 *
 * Reads from extractedData (in-memory during workflow execution).
 * In production with workflow resumption, reads from literatureTableDrafts instead.
 *
 * Input:  state.extractedData, state.confirmedColumns, state.screenedPapers
 * Output: state.tableId, state.tableColumns
 */
export async function generateTableNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { extractedData, confirmedColumns, screenedPapers, query, notebookId, userId } = state;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "populating",
      "in_progress",
      "Creating literature comparison table..."
    );
  }

  // Build table columns with system columns + confirmed columns
  const tableColumns = [
    {
      id: "paper_title",
      name: "Paper Title",
      type: "paper_title" as const,
      isVisible: true,
      isSystem: true,
      order: 0,
    },
    {
      id: "authors",
      name: "Authors",
      type: "authors" as const,
      isVisible: true,
      isSystem: true,
      order: 1,
    },
    {
      id: "year",
      name: "Year",
      type: "year" as const,
      isVisible: true,
      isSystem: true,
      order: 2,
    },
    ...confirmedColumns.map((col, index) => ({
      id: col.id,
      name: col.name,
      type: "custom" as const,
      instructions: col.instructions,
      isVisible: col.isVisible ?? true,
      isSystem: false,
      order: index + 3,
    })),
  ];

  // Build papers array for the table
  const includedPapers = screenedPapers.filter((p) => p.isIncluded);
  const tablePapers = includedPapers.map((paper) => {
    const paperId = paper.doi || paper.title;
    const rowData = extractedData[paperId] || {};

    // Add system column data
    rowData["paper_title"] = paper.title;
    rowData["authors"] = paper.authors?.join(", ") || "Unknown";
    rowData["year"] = paper.year?.toString() || "n.d.";

    return {
      citationId: paperId, // TODO: Map to actual citations table ID
      rowData,
      includeReason: paper.includeReason,
      isIncluded: paper.isIncluded,
    };
  });

  let tableId: string | undefined;

  // TODO: Create literatureTables row in database
  // This requires studio/literature_tables module (Task 8)
  // For now, tableId remains undefined until the module is implemented
  if (deps.ctx) {
    // Placeholder: will call internal.studio.literature_tables.create when available
    tableId = undefined;
  }

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "populating",
      "completed",
      `Created literature table with ${tablePapers.length} papers and ${tableColumns.length} columns`,
      { paperCount: tablePapers.length }
    );
  }

  return {
    tableId,
    tableColumns,
    progress: {
      phase: "populating",
      percentage: 80,
      message: `Created literature table with ${tablePapers.length} papers and ${tableColumns.length} columns.`,
    },
  };
}
