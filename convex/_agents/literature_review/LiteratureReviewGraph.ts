"use node";

import { END, START, StateGraph } from "@langchain/langgraph";
import { LiteratureReviewState, type LiteratureReviewStateType } from "./state";
import type { LiteratureReviewNodeDeps } from "./types";
import { planReviewNode } from "./nodes/planReview";
import { searchPapersNode } from "./nodes/searchPapers";
import { deduplicatePapersNode } from "./nodes/deduplicatePapers";
import { rankPapersNode } from "./nodes/rankPapers";
import { screenPapersNode } from "./nodes/screenPapers";
import { extractDataNode } from "./nodes/extractData";
import { generateTableNode } from "./nodes/generateTable";
import { generateReportNode } from "./nodes/generateReport";

/**
 * LiteratureReviewGraph — LangGraph workflow for automated literature review.
 *
 * Pipeline:
 * planReview → searchPapers → deduplicatePapers → rankPapers → screenPapers → extractData → generateTable → generateReport
 *
 * The graph assumes columns have already been confirmed before invocation.
 * For the initial planning phase (which requires user confirmation), use the planReview action directly.
 */
export class LiteratureReviewGraph {
  private deps: LiteratureReviewNodeDeps;

  constructor(deps: LiteratureReviewNodeDeps) {
    this.deps = deps;
  }

  buildGraph() {
    const builder = new StateGraph(LiteratureReviewState);

    builder.addNode("searchPapers", (state: LiteratureReviewStateType) =>
      searchPapersNode(state, this.deps)
    );
    builder.addNode("deduplicatePapers", (state: LiteratureReviewStateType) =>
      deduplicatePapersNode(state, this.deps)
    );
    builder.addNode("rankPapers", (state: LiteratureReviewStateType) =>
      rankPapersNode(state, this.deps)
    );
    builder.addNode("screenPapers", (state: LiteratureReviewStateType) =>
      screenPapersNode(state, this.deps)
    );
    builder.addNode("extractData", (state: LiteratureReviewStateType) =>
      extractDataNode(state, this.deps)
    );
    builder.addNode("generateTable", (state: LiteratureReviewStateType) =>
      generateTableNode(state, this.deps)
    );
    builder.addNode("generateReport", (state: LiteratureReviewStateType) =>
      generateReportNode(state, this.deps)
    );

    builder.addEdge(START, "searchPapers" as never);
    builder.addEdge("searchPapers" as never, "deduplicatePapers" as never);
    builder.addEdge("deduplicatePapers" as never, "rankPapers" as never);
    builder.addEdge("rankPapers" as never, "screenPapers" as never);
    builder.addEdge("screenPapers" as never, "extractData" as never);
    builder.addEdge("extractData" as never, "generateTable" as never);
    builder.addEdge("generateTable" as never, "generateReport" as never);
    builder.addEdge("generateReport" as never, END as never);

    return builder.compile();
  }

  /**
   * Run the full literature review pipeline (post-column-confirmation).
   */
  async invoke(initialState: LiteratureReviewStateType): Promise<LiteratureReviewStateType> {
    const graph = this.buildGraph();
    return graph.invoke(initialState) as Promise<LiteratureReviewStateType>;
  }
}
