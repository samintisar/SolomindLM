"use node";

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { columnsConfirmedEvent, literatureReviewWorkflow } from "./LiteratureReviewGraph";

function getWorkflowSource() {
  const filePath = join(__dirname, "LiteratureReviewGraph.ts");
  return readFileSync(filePath, "utf-8");
}

describe("LiteratureReviewGraph", () => {
  it("workflow definition exists", () => {
    expect(literatureReviewWorkflow).toBeDefined();
  });

  it("columnsConfirmedEvent exists with correct name", () => {
    expect(columnsConfirmedEvent).toBeDefined();
    expect(columnsConfirmedEvent.name).toBe("columnsConfirmed");
  });

  it("columnsConfirmedEvent has correct validator shape", () => {
    expect(columnsConfirmedEvent.validator).toBeDefined();
    // Convex object validators have a 'fields' property describing the schema
    expect((columnsConfirmedEvent.validator as any).fields).toBeDefined();
    expect((columnsConfirmedEvent.validator as any).fields).toHaveProperty("confirmedColumns");
  });

  it("workflow is a function", () => {
    expect(typeof literatureReviewWorkflow).toBe("function");
  });
});

describe("Workflow step sequence", () => {
  it("workflow has handler defined", () => {
    expect(literatureReviewWorkflow).toBeDefined();
  });

  it("event definition exports correctly", () => {
    expect(columnsConfirmedEvent).toBeDefined();
    expect(columnsConfirmedEvent.name).toBe("columnsConfirmed");
  });

  it("workflow handler has correct number of steps", () => {
    const source = getWorkflowSource();
    const actionMatches = source.match(/step\.runAction\s*\(/g) || [];
    const eventMatches = source.match(/step\.awaitEvent\s*\(/g) || [];

    // plan, search, rank, screen, extractDataBatch×N, table, report (+ 1 column event)
    expect(actionMatches.length).toBeGreaterThanOrEqual(7);
    expect(eventMatches).toHaveLength(1);
  });

  it("steps are in correct order", () => {
    const source = getWorkflowSource();

    // Extract action names from internal.literatureReview.workflowSteps.* references
    const actionRegex = /step\.runAction\s*\(\s*internal\.literatureReview\.workflowSteps\.(\w+)/g;
    const actions: string[] = [];
    let match;
    while ((match = actionRegex.exec(source)) !== null) {
      actions.push(match[1]);
    }

    // Extract event names
    const eventRegex = /step\.awaitEvent\s*\(\s*(\w+)/g;
    const events: string[] = [];
    while ((match = eventRegex.exec(source)) !== null) {
      events.push(match[1]);
    }

    // Build ordered step list by scanning source for step calls
    const _stepCalls: Array<{ type: string; name: string }> = [];
    const _allStepsRegex = /step\.(runAction|awaitEvent)\s*\(/g;
    const _actionNameRegex = /internal\.literatureReview\.workflowSteps\.(\w+)/g;
    const _eventNameRegex = /awaitEvent\s*\(\s*(\w+)/g;

    // We know the expected order from the source structure
    expect(actions).toContain("planReview");
    expect(actions).toContain("searchPapers");
    expect(actions).toContain("rankPapers");
    expect(actions).toContain("screenPapersBatch");
    expect(actions).toContain("extractDataBatch");
    expect(actions).toContain("generateTable");
    expect(actions).toContain("generateReport");
    expect(actions.indexOf("screenPapersBatch")).toBeLessThan(actions.indexOf("extractDataBatch"));
    expect(actions.lastIndexOf("extractDataBatch")).toBeLessThan(actions.indexOf("generateTable"));
    expect(events).toEqual(["columnsConfirmedEvent"]);
  });
});
