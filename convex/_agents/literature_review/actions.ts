"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { env } from "../../_lib/env";
import type { LiteratureReviewStateType } from "./state";
import type { ActionCtx } from "../../_generated/server";
import { planReviewNode } from "./nodes/planReview";
import { searchPapersNode } from "./nodes/searchPapers";
import { deduplicatePapersNode } from "./nodes/deduplicatePapers";
import { rankPapersNode } from "./nodes/rankPapers";
import { screenPapersNode } from "./nodes/screenPapers";
import { extractDataNode } from "./nodes/extractData";
import { generateTableNode } from "./nodes/generateTable";
import { generateReportNode } from "./nodes/generateReport";

function createState(partial: Partial<LiteratureReviewStateType> = {}): LiteratureReviewStateType {
  return {
    query: "",
    searchQueries: [],
    suggestedColumns: [],
    confirmedColumns: [],
    papers: [],
    rankedPapers: [],
    screenedPapers: [],
    extractedData: {},
    tableColumns: [],
    citations: [],
    tableId: undefined,
    reportId: undefined,
    progress: { phase: "planning", percentage: 0, message: "Starting literature review..." },
    error: undefined,
    sessionId: "",
    notebookId: "",
    userId: "",
    ...partial,
  };
}

function createDeps(ctx: ActionCtx, sessionId?: string) {
  return {
    ctx,
    sessionId,
    apiKey: env.TOGETHER_AI_API_KEY,
    smartModel: env.SMART_LLM || "openai/gpt-oss-120b",
  };
}

export const planReview = internalAction({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const state = createState({ query: args.query });
    return planReviewNode(state, createDeps(ctx));
  },
});

export const searchPapers = internalAction({
  args: { query: v.string(), searchQueries: v.array(v.string()) },
  handler: async (ctx, args) => {
    const state = createState({
      query: args.query,
      searchQueries: args.searchQueries,
    });
    return searchPapersNode(state, createDeps(ctx));
  },
});

export const deduplicatePapers = internalAction({
  args: { papers: v.array(v.any()) },
  handler: async (ctx, args) => {
    const state = createState({ papers: args.papers });
    return deduplicatePapersNode(state, createDeps(ctx));
  },
});

export const rankPapers = internalAction({
  args: { papers: v.array(v.any()), query: v.string() },
  handler: async (ctx, args) => {
    const state = createState({
      papers: args.papers,
      query: args.query,
    });
    return rankPapersNode(state, createDeps(ctx));
  },
});

export const screenPapers = internalAction({
  args: { papers: v.array(v.any()), query: v.string() },
  handler: async (ctx, args) => {
    const state = createState({
      rankedPapers: args.papers,
      query: args.query,
    });
    return screenPapersNode(state, createDeps(ctx));
  },
});

export const extractData = internalAction({
  args: {
    papers: v.array(v.any()),
    columns: v.array(v.any()),
    sessionId: v.id("literatureReviewSessions"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const state = createState({
      screenedPapers: args.papers,
      confirmedColumns: args.columns,
      query: args.query,
      sessionId: args.sessionId,
    });
    return extractDataNode(state, createDeps(ctx, args.sessionId));
  },
});

export const generateTable = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    columns: v.array(v.any()),
    query: v.string(),
    notebookId: v.string(),
    userId: v.string(),
    extractedData: v.record(v.string(), v.record(v.string(), v.string())),
    screenedPapers: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const state = createState({
      sessionId: args.sessionId,
      confirmedColumns: args.columns,
      query: args.query,
      notebookId: args.notebookId,
      userId: args.userId,
      extractedData: args.extractedData,
      screenedPapers: args.screenedPapers,
    });
    return generateTableNode(state, createDeps(ctx, args.sessionId));
  },
});

export const generateReport = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    tableId: v.optional(v.id("literatureTables")),
    query: v.string(),
    extractedData: v.record(v.string(), v.record(v.string(), v.string())),
    screenedPapers: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const state = createState({
      sessionId: args.sessionId,
      tableId: args.tableId,
      query: args.query,
      extractedData: args.extractedData,
      screenedPapers: args.screenedPapers,
    });
    return generateReportNode(state, createDeps(ctx, args.sessionId));
  },
});
