"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { createResearchAgent } from "../chat/_streamResearch";
import { runResearchExecuteImpl } from "../chat/_researchExecuteImpl";

export const planReview = internalAction({
  args: {
    query: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.string(),
    sourcePolicy: v.object({
      channels: v.array(v.string()),
      domainAllowlist: v.optional(v.array(v.string())),
      dateRange: v.optional(v.object({ start: v.number(), end: v.number() })),
      maxResultsPerChannel: v.optional(v.number()),
      credibilityTier: v.optional(v.string()),
      requirePrimarySources: v.optional(v.boolean()),
      recencyDays: v.optional(v.number()),
      dedupeStrategy: v.optional(v.string()),
      academicFilters: v.optional(
        v.object({
          publicationYearFrom: v.optional(v.number()),
          publicationYearTo: v.optional(v.number()),
          minCitations: v.optional(v.number()),
          openAccessOnly: v.optional(v.boolean()),
          hasFullText: v.optional(v.boolean()),
          fieldOfStudyTerms: v.optional(v.array(v.string())),
        })
      ),
    }),
    smartModel: v.optional(v.string()),
  },
  returns: v.object({
    subQuestions: v.array(
      v.object({
        id: v.string(),
        question: v.string(),
        searchQueries: v.array(v.string()),
        sourceChannels: v.array(v.string()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const agent = await createResearchAgent({
      apiKey: process.env.TOGETHER_API_KEY ?? "",
      smartModel: args.smartModel ?? process.env.SMART_MODEL ?? "openai/gpt-oss-120b",
      notebookId: args.notebookId,
      userId: args.userId,
      sourcePolicy: args.sourcePolicy,
      onProgress: async () => {},
    });

    const subQuestions = await agent.generatePlan(
      args.query,
      args.sourcePolicy as Parameters<typeof agent.generatePlan>[1]
    );

    return {
      subQuestions: subQuestions.map((sq) => ({
        id: sq.id,
        question: sq.question,
        searchQueries: sq.searchQueries,
        sourceChannels: sq.sourceChannels,
      })),
    };
  },
});

export const executeResearch = internalAction({
  args: {
    runId: v.id("researchRuns"),
    streamId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await runResearchExecuteImpl(ctx, {
      runId: args.runId,
      streamId: args.streamId,
      userId: args.userId,
    });
  },
});
