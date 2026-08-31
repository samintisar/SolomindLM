import { vOnEmailEventArgs } from "@convex-dev/resend";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const type = args.event.type;
    if (type !== "email.bounced" && type !== "email.complained") return null;
    const to = args.event.data.to;
    const addresses = Array.isArray(to) ? to : [to];
    const reason = type === "email.bounced" ? "bounce" : "complaint";
    for (const email of addresses) {
      if (!email) continue;
      const existing = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) continue;
      await ctx.db.insert("emailSuppressions", {
        email,
        reason,
        emailId: args.id,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
