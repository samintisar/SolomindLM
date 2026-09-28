import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

export const listTokensForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.object({ tokenId: v.id("mobilePushTokens"), expoPushToken: v.string() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("mobilePushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows.map((row) => ({ tokenId: row._id, expoPushToken: row.expoPushToken }));
  },
});

export const deleteToken = internalMutation({
  args: { tokenId: v.id("mobilePushTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.tokenId);
    return null;
  },
});

/**
 * Sends a push notification to every device registered for a user via Expo's push API,
 * and prunes any token Expo reports as no longer registered.
 */
export const sendPushToUser = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(internal.push.send.listTokensForUser, {
      userId: args.userId,
    });
    if (tokens.length === 0) return null;

    const messages = tokens.map((token) => ({
      to: token.expoPushToken,
      title: args.title,
      body: args.body,
      data: args.data,
      sound: "default" as const,
    }));

    const response = await fetch(EXPO_PUSH_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error(`[push] Expo push API returned ${response.status}`);
      return null;
    }

    const json = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = json.data ?? [];

    await Promise.all(
      tickets.map((ticket, index) => {
        const token = tokens[index];
        if (token && ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          return ctx.runMutation(internal.push.send.deleteToken, { tokenId: token.tokenId });
        }
        return undefined;
      })
    );

    return null;
  },
});
