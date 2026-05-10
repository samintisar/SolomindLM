"use node";

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { env } from "../../_lib/env";

import { planReviewNode } from "./nodes/planReview";
import { searchPapersNode } from "./nodes/searchPapers";
import { deduplicatePapersNode } from "./nodes/deduplicatePapers";
import { rankPapersNode } from "./nodes/rankPapers";
import { screenPapersNode } from "./nodes/screenPapers";
import { extractDataNode } from "./nodes/extractData";
import { generateTableNode } from "./nodes/generateTable";
import { generateReportNode } from "./nodes/generateReport";

import type { LiteratureReviewStateType } from "./state";
import type { LiteratureReviewNodeDeps } from "./types";

function buildDeps(ctx: any): LiteratureReviewNodeDeps {
  return {
    ctx,
    apiKey: env.OPENAI_API_KEY,
    smartModel: env.SMART_LLM,
  };
}

function defaultState(): LiteratureReviewStateType {
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
    progress: { phase: "planning", percentage: 0, message: "Starting..." },
    error: undefined,
    sessionId: "",
    notebookId: "",
    userId: "",
  };
}

/**
 * planReview action: LLM plans search strategy and suggests comparison table columns.
 */
export const planReview = internalAction({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const state: LiteratureReviewStateType = {
      ...defaultState(),
      query: args.query,
    };
    const result = await planReviewNode(state, buildDeps(ctx));
    return result;
  },
});

/**
 * searchPapers action: Search academic sources (arXiv, Semantic Scholar, PubMed).
 */
export const searchPapers = internalAction({
  args: {
    query: v.string(),
    searchQueries: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const state: LiteratureReviewStateType = {
      ...defaultState(),
      query: args.query,
      searchQueries: args.searchQueries,
    };
    const result = await searchPapersNode(state, buildDeps(ctx));
    return result;
  },
});

/**
 * deduplicatePapers action: Remove duplicate papers from multiple sources.
 */
export const deduplicatePapers = internalAction({
  args: {
    papers: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const state: LiteratureReviewStateType = {
      ...defaultState(),
      papers: args.papers,
    };
    const result = await deduplicatePapersNode(state, buildDeps(ctx));
    return result;
  },
});

/**
 * rankPapers action: Rank papers by relevance to the research question.
 */
export const rankPapers = internalAction({
  args: {
    papers: v.array(v.any()),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const state: LiteratureReviewStateType = {
      ...defaultState(),
      papers: args.papers,
      query: args.query,
    };
    const result = await rankPapersNode(state, buildDeps(ctx));
    return result;
  },
});

/**
 * screenPapers action: PRISMA-style eligibility screening.
 */
export const screenPapers = internalAction({
  args: {
    papers: v.array(v.any()),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const state: LiteratureReviewStateType = {
      ...defaultState(),
      rankedPapers: args.papers,
      query: args.query,
    };
    const result = await screenPapersNode(state, buildDeps(ctx));
    return result;
  },
});

/**
 * extractData action: Batched data extraction for confirmed columns.
 */
export const extractData = internalAction({
  args: {
    papers: v.array(v.any()),
    columns: v.array(v.any()),
    sessionId: v.id("literatureReviewSessions"),
  },
  handler: async (ctx, args) => {
    const state: LiteratureReviewStateType = {
      ...defaultState(),
      screenedPapers: args.papers,
      confirmedColumns: args.columns,
      sessionId: args.sessionId,
    };
    const deps = buildDeps(ctx);
    deps.sessionId = args.sessionId;
    const result = await extractDataNode(state, deps);
    return result;
  },
});

/**
 * generateTable action: Create literatureTables row from extracted data.
 */
export const generateTable = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    columns: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(
      internal.studio.literature_tables.index.getSessionInternal,
      { sessionId: args.sessionId }
    );
    if (!session) {
      throw new Error(`Session ${args.sessionId} not found`);
    }

    const state: LiteratureReviewStateType = {
      ...defaultState(),
      sessionId: args.sessionId,
      notebookId: session.notebookId,
      userId: session.userId,
      query: session.query,
      confirmedColumns: args.columns,
      screenedPapers: [],
      extractedData: {},
    };
    const deps = buildDeps(ctx);
    deps.sessionId = args.sessionId;
    const result = await generateTableNode(state, deps);
    return result;
  },
});

/**
 * generateReport action: Generate formal academic report section-by-section.
 */
export const generateReport = internalAction({
  args: {
    sessionId: v.id("literatureReviewSessions"),
    tableId: v.optional(v.id("literatureTables")),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(
      internal.studio.literature_tables.index.getSessionInternal,
      { sessionId: args.sessionId }
    );
    if (!session) {
      throw new Error(`Session ${args.sessionId} not found`);
    }

    const state: LiteratureReviewStateType = {
      ...defaultState(),
      sessionId: args.sessionId,
      notebookId: session.notebookId,
      userId: session.userId,
      query: args.query,
      tableId: args.tableId,
      screenedPapers: [],
      extractedData: {},
    };
    const deps = buildDeps(ctx);
    deps.sessionId = args.sessionId;
    const result = await generateReportNode(state, deps);
    return result;
  },
});
