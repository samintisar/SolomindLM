import { v } from "convex/values";
import { query } from "../_generated/server";
import { assertCanReadNotebook } from "../_lib/notebookAccess";
import { getAuthUserId } from "../auth";

export const getExistingPapers = query({
  args: {
    notebookId: v.id("notebooks"),
  },
  returns: v.object({
    dois: v.array(v.string()),
    titleHashes: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    await assertCanReadNotebook(ctx, args.notebookId, userId);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook_and_fileType", (q) =>
        q.eq("notebookId", args.notebookId).eq("fileType", "paper_record")
      )
      .collect();

    const dois: string[] = [];
    const titleHashes: string[] = [];

    for (const doc of documents) {
      const pr = doc.paperRecord;
      if (!pr) continue;

      if (pr.doi) {
        dois.push(pr.doi.toLowerCase().trim());
      }

      const title = doc.fileName || "";
      if (title && pr.authors && pr.authors.length > 0) {
        const firstAuthor = pr.authors[0];
        const hash = `${title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`;
        titleHashes.push(hash);
      }
    }

    return { dois, titleHashes };
  },
});
