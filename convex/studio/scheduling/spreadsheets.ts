"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { action } from "../../_generated/server";
import { getAuthUserId } from "../../auth";

interface ScheduleSpreadsheetResult {
  spreadsheetId: string;
  status: string;
  spreadsheet: { _id: string; title: string; status: string };
}

export const scheduleSpreadsheet = action({
  args: {
    notebookId: v.id("notebooks"),
    documentIds: v.optional(v.array(v.id("documents"))),
    title: v.optional(v.string()),
    spreadsheetType: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScheduleSpreadsheetResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await ctx.runMutation(internal._lib.limits.checkDailyLimitInternal, {
      userId,
      feature: "spreadsheet",
    });

    const documentIds = args.documentIds ?? [];
    if (documentIds.length === 0) {
      throw new Error(
        "Please select at least one source. Content generation uses only your selected sources."
      );
    }

    const spreadsheet = await ctx.runMutation(internal.studio.spreadsheets.index.createInternal, {
      userId,
      notebookId: args.notebookId,
      title: args.title || "Spreadsheet",
      spreadsheetType: args.spreadsheetType || "custom",
      customPrompt: args.customPrompt || "",
      metadata: {
        status: "generating",
        documentIds,
      },
    });
    if (!spreadsheet) {
      throw new Error("Failed to create spreadsheet");
    }
    const spreadsheetId = spreadsheet._id;

    await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.spreadsheetGeneration, {
      spreadsheetId,
      userId,
      notebookId: args.notebookId,
      documentIds,
      spreadsheetType: args.spreadsheetType || "custom",
      customPrompt: args.customPrompt,
    });

    return { spreadsheetId, status: "generating", spreadsheet };
  },
});
