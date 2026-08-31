import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

export const isEmailSuppressed = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    return existing !== null;
  },
});
