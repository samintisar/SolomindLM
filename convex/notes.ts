import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "./auth";

/**
 * Unified query to fetch all note types for a notebook in a single request.
 * This replaces 8 separate queries with 1, reducing WebSocket subscriptions
 * and providing a unified loading state.
 *
 * @returns Array of all notes with a `type` discriminator field
 */
export const listAllByNotebook = query({
  args: {
    notebookId: v.id("notebooks"),
    // Optional: Filter by specific types to reduce payload
    types: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      return [];
    }

    // Fetch all note types in parallel using Promise.all
    const types = args.types ?? [
      "reports",
      "flashcards",
      "quizzes",
      "mindmaps",
      "audioOverviews",
      "slides",
      "spreadsheets",
      "writtenQuestions",
    ];

    const queries: Promise<any[]>[] = [];

    // Build queries only for requested types
    if (!args.types || args.types.includes("reports")) {
      queries.push(
        ctx.db
          .query("reports")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "report" as const })))
      );
    }

    if (!args.types || args.types.includes("flashcards")) {
      queries.push(
        ctx.db
          .query("flashcards")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "flashcard" as const })))
      );
    }

    if (!args.types || args.types.includes("quizzes")) {
      queries.push(
        ctx.db
          .query("quizzes")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "quiz" as const })))
      );
    }

    if (!args.types || args.types.includes("mindmaps")) {
      queries.push(
        ctx.db
          .query("mindmaps")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "mindmap" as const })))
      );
    }

    if (!args.types || args.types.includes("audioOverviews")) {
      queries.push(
        ctx.db
          .query("audioOverviews")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "audioOverview" as const })))
      );
    }

    if (!args.types || args.types.includes("slides")) {
      queries.push(
        ctx.db
          .query("slides")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "slides" as const })))
      );
    }

    if (!args.types || args.types.includes("spreadsheets")) {
      queries.push(
        ctx.db
          .query("spreadsheets")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "spreadsheet" as const })))
      );
    }

    if (!args.types || args.types.includes("writtenQuestions")) {
      queries.push(
        ctx.db
          .query("writtenQuestions")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "writtenQuestions" as const })))
      );
    }

    // Execute all queries in parallel and merge results
    const results = await Promise.all(queries);
    const allNotes = results.flat();

    // Sort by updatedAt descending (most recent first)
    allNotes.sort((a, b) => b.updatedAt - a.updatedAt);

    return allNotes;
  },
});

/**
 * Get a single note by type and ID
 */
export const getById = query({
  args: {
    type: v.string(),
    id: v.id("documents"), // Use documents as a generic ID type, validated at runtime
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    // Map type to table name
    const tableMap: Record<string, string> = {
      report: "reports",
      flashcard: "flashcards",
      quiz: "quizzes",
      mindmap: "mindmaps",
      audioOverview: "audioOverviews",
      slides: "slides",
      spreadsheet: "spreadsheets",
      writtenQuestions: "writtenQuestions",
    };

    const tableName = tableMap[args.type];
    if (!tableName) {
      return null;
    }

    // Query the appropriate table
    const note = await ctx.db.get(args.id as any);
    if (!note) return null;

    // Verify ownership
    if ("userId" in note && note.userId !== userId) {
      return null;
    }

    return { ...note, _type: args.type };
  },
});

/**
 * Count notes by type for a notebook
 */
export const countByType = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    // Verify user owns the notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== userId) {
      return null;
    }

    // Count all types in parallel
    const [reports, flashcards, quizzes, mindmaps, audioOverviews, slides, spreadsheets, writtenQuestions] =
      await Promise.all([
        ctx.db
          .query("reports")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("flashcards")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("quizzes")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("mindmaps")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("audioOverviews")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("slides")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("spreadsheets")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
        ctx.db
          .query("writtenQuestions")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect()
          .then((items) => items.length),
      ]);

    return {
      reports,
      flashcards,
      quizzes,
      mindmaps,
      audioOverviews,
      slides,
      spreadsheets,
      writtenQuestions,
      total:
        reports +
        flashcards +
        quizzes +
        mindmaps +
        audioOverviews +
        slides +
        spreadsheets +
        writtenQuestions,
    };
  },
});
