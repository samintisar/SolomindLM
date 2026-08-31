"use node";

import { v } from "convex/values";
import { Resend } from "resend";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

const eventNameValidator = v.union(
  v.literal("user.created"),
  v.literal("notebook.created"),
  v.literal("source.added"),
  v.literal("artifact.generated"),
  v.literal("onboarding.completed"),
  v.literal("subscription.started"),
  v.literal("subscription.canceled"),
  v.literal("invoice.paid"),
  v.literal("invoice.payment_failed")
);

export const emit = internalAction({
  args: {
    event: eventNameValidator,
    email: v.string(),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const suppressed = await ctx.runQuery(internal.email.suppressions.isEmailSuppressed, {
      email: args.email,
    });
    if (suppressed) return null;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY not configured");
    const resend = new Resend(apiKey);
    const { error } = await resend.events.send({
      event: args.event,
      email: args.email,
      payload: args.payload ?? {},
    });
    if (error) throw new Error(error.message);
    return null;
  },
});
