import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import * as Folders from "../_model/folders";

/**
 * One-off / CLI: delete all folders for a user whose name starts with `namePrefix` (default `e2e-`).
 * Unlinks notebooks from each folder (same as public `folders.remove`).
 *
 * Run (dev, from repo root; use your E2E account email; `--push` syncs if needed):
 *   bunx convex run --push e2e/cleanupFolders:deleteE2eFoldersByEmail '{"email":"you@example.com"}'
 *   bunx convex run e2e/cleanupFolders:deleteE2eFoldersByEmail '{"email":"you@example.com","namePrefix":"e2e-"}'
 * Optional: pass `userId` instead of `email` to avoid lookup. In code, use `internal.e2e.cleanupFolders.*`.
 */
export const deleteE2eFoldersByEmail = internalMutation({
  args: {
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    namePrefix: v.optional(v.string()),
  },
  returns: v.object({
    deleted: v.number(),
    folderNames: v.array(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const namePrefix = args.namePrefix ?? "e2e-";

    let userId: Id<"users"> | null = args.userId ?? null;
    if (!userId) {
      const email = args.email?.trim();
      if (!email) {
        return { deleted: 0, folderNames: [], error: "Provide `email` or `userId`" };
      }
      const user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), email))
        .first();
      if (!user) {
        return { deleted: 0, folderNames: [], error: `No user with email: ${email}` };
      }
      userId = user._id;
    }

    const folders = await Folders.getUserFolders(ctx, userId);
    const toDelete = folders.filter((f) => f.name.startsWith(namePrefix));
    const folderNames: string[] = [];
    for (const f of toDelete) {
      await Folders.unlinkNotebooksFromFolder(ctx, f._id);
      await Folders.deleteFolder(ctx, f._id);
      folderNames.push(f.name);
    }
    return { deleted: toDelete.length, folderNames, error: undefined };
  },
});
