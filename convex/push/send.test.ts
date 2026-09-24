/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function makeT() {
  return convexTest(schema, modules);
}

async function seedUserWithTokens(
  t: ReturnType<typeof convexTest>,
  tokens: string[]
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "T" });
    const now = Date.now();
    for (const expoPushToken of tokens) {
      await ctx.db.insert("mobilePushTokens", {
        userId,
        expoPushToken,
        platform: "ios",
        createdAt: now,
        updatedAt: now,
      });
    }
    return userId;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("push.send.sendPushToUser", () => {
  test("sends one Expo push message per registered token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { status: "ok", id: "r1" },
              { status: "ok", id: "r2" },
            ],
          }),
          {
            status: 200,
          }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const t = makeT();
    const userId = await seedUserWithTokens(t, [
      "ExponentPushToken[aaa]",
      "ExponentPushToken[bbb]",
    ]);

    await t.action(internal.push.send.sendPushToUser, {
      userId,
      title: "Report ready",
      body: '"My report" is ready to view.',
      data: { type: "studio", kind: "report", notebookId: "n1", itemId: "r1" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("exp.host");
    const sentMessages = JSON.parse(init.body as string);
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0]).toMatchObject({
      to: "ExponentPushToken[aaa]",
      title: "Report ready",
    });

    const remaining = await t.run((ctx) =>
      ctx.db
        .query("mobilePushTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    );
    expect(remaining).toHaveLength(2);
  });

  test("prunes tokens Expo reports as no longer registered", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { status: "ok", id: "r1" },
              { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
            ],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const t = makeT();
    const userId = await seedUserWithTokens(t, [
      "ExponentPushToken[good]",
      "ExponentPushToken[stale]",
    ]);

    await t.action(internal.push.send.sendPushToUser, {
      userId,
      title: "Deep research ready",
      body: "Your deep research run has finished.",
    });

    const remaining = await t.run((ctx) =>
      ctx.db
        .query("mobilePushTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.expoPushToken).toBe("ExponentPushToken[good]");
  });

  test("does not call Expo when the user has no registered tokens", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const t = makeT();
    const userId = await seedUserWithTokens(t, []);

    await t.action(internal.push.send.sendPushToUser, {
      userId,
      title: "Quiz ready",
      body: "Your quiz is ready.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
