"use node";

import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { action } from "../_generated/server";
import { ExternalServiceError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { getAuthUserId } from "../auth";

const stripeClient = new StripeSubscriptions(components.stripe, {});

/**
 * Permanently deletes the signed-in user's account (App Store guideline 5.1.1(v)).
 *
 * Cancels any subscription that could still bill first, immediately rather than at
 * period end; if Stripe fails, nothing is deleted and the error reaches the client.
 * Then removes the user and their sign-in records (signing them out everywhere) and
 * schedules the purge of everything they own.
 */
export const deleteAccount = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const subscriptionIds: string[] = await ctx.runQuery(
      internal.account.deletion.listBillableSubscriptionIds,
      { userId }
    );
    for (const stripeSubscriptionId of subscriptionIds) {
      try {
        await stripeClient.cancelSubscription(ctx, {
          stripeSubscriptionId,
          cancelAtPeriodEnd: false,
        });
      } catch (error) {
        console.error(`[accountDeletion] could not cancel ${stripeSubscriptionId}`, error);
        // Typed, so the dialog says billing is unavailable rather than "Server Error".
        throw toConvexError(
          new ExternalServiceError("Billing", "Could not cancel your subscription", {
            retryable: true,
          })
        );
      }
    }

    await ctx.runMutation(internal.account.deletion.deleteUserIdentity, { userId });
    return null;
  },
});
