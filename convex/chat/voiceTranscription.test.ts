/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import * as rateLimitsModule from "../_lib/rateLimits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./chat/voiceTranscription.ts"]);

const originalCheck = rateLimitsModule.rateLimiter.check;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  rateLimitsModule.rateLimiter.check = originalCheck;
  vi.restoreAllMocks();
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "NB",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const storageId = await ctx.storage.store(new Blob(["fake audio"]));
    return { owner, notebookId, storageId };
  });
}

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId as string}|session1` });

const blobExists = (t: ReturnType<typeof convexTest>, id: Id<"_storage">) =>
  t.run(async (ctx) => (await ctx.storage.get(id)) !== null);

describe("transcribeChatAudio", () => {
  test("deletes the uploaded clip when the daily limit rejects the request", async () => {
    const t = convexTest(schema, modules);
    const { owner, notebookId, storageId } = await seed(t);
    rateLimitsModule.rateLimiter.check = vi.fn().mockRejectedValue(new Error("Rate limit"));

    await expect(
      asUser(t, owner).action(api.chat.voiceTranscription.transcribeChatAudio, {
        storageId,
        notebookId,
      })
    ).rejects.toThrow();

    expect(await blobExists(t, storageId)).toBe(false);
  });

  test("does not delete a storage object for a caller without notebook access", async () => {
    const t = convexTest(schema, modules);
    const { notebookId, storageId } = await seed(t);
    const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "Stranger" }));

    await expect(
      asUser(t, stranger).action(api.chat.voiceTranscription.transcribeChatAudio, {
        storageId,
        notebookId,
      })
    ).rejects.toThrow();

    expect(await blobExists(t, storageId)).toBe(true);
  });
});
