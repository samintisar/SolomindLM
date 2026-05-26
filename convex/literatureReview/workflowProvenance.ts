import { v } from "convex/values";

/** Persisted PRISMA-style counts and search provenance for a literature review session. */
export const literatureReviewWorkflowProvenanceValidator = v.object({
  searchQueries: v.optional(v.array(v.string())),
  databasesUsed: v.optional(v.array(v.string())),
  recordsIdentified: v.optional(v.number()),
  recordsAfterDedupe: v.optional(v.number()),
  recordsRanked: v.optional(v.number()),
  recordsScreened: v.optional(v.number()),
  recordsIncluded: v.optional(v.number()),
  recordsExcluded: v.optional(v.number()),
  extractedRowCount: v.optional(v.number()),
  searchCompletedAt: v.optional(v.number()),
  rankCompletedAt: v.optional(v.number()),
  screenCompletedAt: v.optional(v.number()),
  extractCompletedAt: v.optional(v.number()),
});

export type LiteratureReviewWorkflowProvenance = {
  searchQueries?: string[];
  databasesUsed?: string[];
  recordsIdentified?: number;
  recordsAfterDedupe?: number;
  recordsRanked?: number;
  recordsScreened?: number;
  recordsIncluded?: number;
  recordsExcluded?: number;
  extractedRowCount?: number;
  searchCompletedAt?: number;
  rankCompletedAt?: number;
  screenCompletedAt?: number;
  extractCompletedAt?: number;
};

export const screeningDecisionValidator = v.object({
  sessionId: v.id("literatureReviewSessions"),
  paperIndex: v.number(),
  title: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  decision: v.union(v.literal("included"), v.literal("excluded")),
  reason: v.string(),
  rank: v.optional(v.number()),
});
