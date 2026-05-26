import { v } from "convex/values";
import { query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { assertCanReadNotebook } from "../_lib/notebookAccess";
import * as NotesModel from "../_model/notes";

/**
 * Unified query to fetch all note types for a notebook in a single request.
 * This replaces 8 separate queries with 1, reducing WebSocket subscriptions
 * and providing a unified loading state.
 *
 * @returns Array of all notes with a `type` discriminator field
 */
export const list = query({
  args: {
    notebookId: v.id("notebooks"),
    // Optional: Filter by specific types to reduce payload
    types: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    try {
      await assertCanReadNotebook(ctx, args.notebookId, userId);
    } catch {
      return [];
    }

    const _types = args.types ?? [
      "reports",
      "flashcards",
      "quizzes",
      "mindmaps",
      "audioOverviews",
      "infographics",
      "spreadsheets",
      "writtenQuestions",
      "notes",
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queries: Promise<any[]>[] = [];

    if (!args.types || args.types.includes("reports")) {
      queries.push(
        ctx.db
          .query("reports")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
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
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "audioOverview" as const })))
      );
    }

    if (!args.types || args.types.includes("infographics")) {
      queries.push(
        ctx.db
          .query("infographics")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "infographic" as const })))
      );
    }

    if (!args.types || args.types.includes("spreadsheets")) {
      queries.push(
        ctx.db
          .query("spreadsheets")
          .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
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
          .order("desc")
          .collect()
          .then((items) => items.map((item) => ({ ...item, _type: "writtenQuestions" as const })))
      );
    }

    if (!args.types || args.types.includes("notes")) {
      queries.push(
        NotesModel.listByNotebookShared(ctx, args.notebookId, userId).then((items) =>
          items.map((item) => ({ ...item, _type: "note" as const }))
        )
      );
    }

    const results = await Promise.all(queries);
    const allNotes = results.flat();

    allNotes.sort((a, b) => b.updatedAt - a.updatedAt);

    return allNotes;
  },
});

/**
 * Get a single note by type and ID
 */
export const get = query({
  args: {
    type: v.string(),
    id: v.union(
      v.id("reports"),
      v.id("flashcards"),
      v.id("quizzes"),
      v.id("mindmaps"),
      v.id("audioOverviews"),
      v.id("infographics"),
      v.id("spreadsheets"),
      v.id("writtenQuestions"),
      v.id("notes")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const tableMap: Record<string, string> = {
      report: "reports",
      flashcard: "flashcards",
      quiz: "quizzes",
      mindmap: "mindmaps",
      audioOverview: "audioOverviews",
      infographic: "infographics",
      spreadsheet: "spreadsheets",
      writtenQuestions: "writtenQuestions",
      note: "notes",
    };

    const tableName = tableMap[args.type];
    if (!tableName) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const note = await ctx.db.get(args.id as any);
    if (!note) return null;

    if (!("notebookId" in note)) {
      return null;
    }

    try {
      if (!note.notebookId) return null;
      await assertCanReadNotebook(ctx, note.notebookId, userId);
    } catch {
      return null;
    }

    if (tableName === "notes" && "type" in note) {
      if (note.type === "chat" && note.userId !== userId) {
        return null;
      }
    }

    return { ...note, _type: args.type };
  },
});

/**
 * Count notes by type for a notebook
 */
export const count = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    try {
      await assertCanReadNotebook(ctx, args.notebookId, userId);
    } catch {
      return null;
    }

    const sharedNotes = await NotesModel.listByNotebookShared(ctx, args.notebookId, userId);

    const [
      reports,
      flashcards,
      quizzes,
      mindmaps,
      audioOverviews,
      infographics,
      spreadsheets,
      writtenQuestions,
    ] = await Promise.all([
      ctx.db
        .query("reports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("flashcards")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("quizzes")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("mindmaps")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("audioOverviews")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("infographics")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("spreadsheets")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("writtenQuestions")
        .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
        .collect()
        .then((items) => items.length),
    ]);

    const notes = sharedNotes.length;

    return {
      reports,
      flashcards,
      quizzes,
      mindmaps,
      audioOverviews,
      infographics,
      spreadsheets,
      writtenQuestions,
      notes,
      total:
        reports +
        flashcards +
        quizzes +
        mindmaps +
        audioOverviews +
        infographics +
        spreadsheets +
        writtenQuestions +
        notes,
    };
  },
});
