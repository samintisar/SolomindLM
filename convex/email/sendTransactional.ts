import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { resolveTransactionalFrom } from "../_lib/authResendFrom";
import { resend } from "./client";

export const enqueue = internalMutation({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const suppressed = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", args.to))
      .first();
    if (suppressed) return null;

    await resend.sendEmail(ctx, {
      from: resolveTransactionalFrom(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return null;
  },
});
