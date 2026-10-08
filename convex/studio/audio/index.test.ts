/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

type T = ReturnType<typeof convexTest>;

const asUser = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session1` });

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const member = await ctx.db.insert("users", { name: "Member" });
    const stranger = await ctx.db.insert("users", { name: "Stranger" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Notebook",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notebookMembers", {
      notebookId,
      userId: member,
      role: "editor",
      joinedAt: now,
    });
    const storageId = await ctx.storage.store(new Blob(["mp3"], { type: "audio/mpeg" }));
    return { owner, member, stranger, notebookId, storageId };
  });
}

async function addOverview(
  t: T,
  fields: {
    userId: Id<"users">;
    notebookId: Id<"notebooks">;
    audioUrl?: string;
    audioStorageId?: Id<"_storage">;
  }
) {
  await t.run(async (ctx) =>
    ctx.db.insert("audioOverviews", {
      ...fields,
      title: "Overview",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

const resolve = (t: T, userId: Id<"users">, audioUrl: string) =>
  asUser(t, userId).query(api.studio.audio.index.resolveRawAudioUrl, { audioUrl });

describe("studio.audio.resolvePlaybackUrl", () => {
  test("returns null when the overview's audioUrl names no file", async () => {
    const t = convexTest(schema, modules);
    const { owner, notebookId } = await seed(t);
    const audioOverviewId = await t.run(async (ctx) =>
      ctx.db.insert("audioOverviews", {
        userId: owner,
        notebookId,
        title: "Overview",
        status: "completed",
        audioUrl: "/audio/",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    expect(
      await asUser(t, owner).query(api.studio.audio.index.resolvePlaybackUrl, { audioOverviewId })
    ).toBeNull();
  });

  test("re-signs a full URL to the removed .convex.site/audio/ route", async () => {
    const t = convexTest(schema, modules);
    const { owner, notebookId, storageId } = await seed(t);
    const audioOverviewId = await t.run(async (ctx) =>
      ctx.db.insert("audioOverviews", {
        userId: owner,
        notebookId,
        title: "Overview",
        status: "completed",
        audioUrl: `https://calm-fox-456.convex.site/audio/${storageId}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const signedUrl = await t.run(async (ctx) => ctx.storage.getUrl(storageId));

    expect(
      await asUser(t, owner).query(api.studio.audio.index.resolvePlaybackUrl, { audioOverviewId })
    ).toEqual({ url: signedUrl });
  });
});

describe("studio.audio.resolveRawAudioUrl", () => {
  test("signs the file for the notebook owner and members", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, notebookId, storageId } = await seed(t);
    await addOverview(t, { userId: owner, notebookId, audioStorageId: storageId });

    for (const userId of [owner, member]) {
      const result = await resolve(t, userId, storageId);
      expect(result?.url).toEqual(expect.stringContaining("http"));
    }
  });

  test("returns null to a signed-in user who cannot read the notebook", async () => {
    const t = convexTest(schema, modules);
    const { owner, stranger, notebookId, storageId } = await seed(t);
    await addOverview(t, { userId: owner, notebookId, audioStorageId: storageId });

    expect(await resolve(t, stranger, storageId)).toBeNull();
    expect(await resolve(t, stranger, `/audio/${storageId}`)).toBeNull();
  });

  test("returns null for a stored file no audio overview points at", async () => {
    const t = convexTest(schema, modules);
    const { owner, storageId } = await seed(t);

    expect(await resolve(t, owner, storageId)).toBeNull();
  });

  test("returns null for a reference that is not a storage id", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await seed(t);

    expect(await resolve(t, owner, "/audio/not-a-storage-id")).toBeNull();
  });

  test("returns null for an empty storage reference", async () => {
    const t = convexTest(schema, modules);
    const { owner, notebookId } = await seed(t);
    await addOverview(t, { userId: owner, notebookId, audioUrl: "/audio/" });

    expect(await resolve(t, owner, "/audio/")).toBeNull();
    expect(await resolve(t, owner, "/")).toBeNull();
  });

  test("finds legacy overviews that store only an /audio/ path", async () => {
    const t = convexTest(schema, modules);
    const { owner, stranger, notebookId, storageId } = await seed(t);
    await addOverview(t, { userId: owner, notebookId, audioUrl: `/audio/${storageId}` });

    expect((await resolve(t, owner, `/audio/${storageId}`))?.url).toBeTruthy();
    expect(await resolve(t, stranger, `/audio/${storageId}`)).toBeNull();
  });

  test("finds forked overviews that store only the signed URL", async () => {
    const t = convexTest(schema, modules);
    const { owner, stranger, notebookId, storageId } = await seed(t);
    const signedUrl = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    await addOverview(t, { userId: owner, notebookId, audioUrl: signedUrl ?? undefined });

    expect((await resolve(t, owner, storageId))?.url).toBe(signedUrl);
    expect(await resolve(t, stranger, storageId)).toBeNull();
  });

  test("finds the caller's overview behind many unreadable forks of the same file", async () => {
    const t = convexTest(schema, modules);
    const { owner, stranger, notebookId, storageId } = await seed(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        const forkOwner = await ctx.db.insert("users", { name: `Forker ${i}` });
        const forkNotebook = await ctx.db.insert("notebooks", {
          userId: forkOwner,
          title: `Fork ${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.insert("audioOverviews", {
          userId: forkOwner,
          notebookId: forkNotebook,
          title: "Overview",
          status: "completed",
          audioStorageId: storageId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });
    // Inserted last, so it sorts after every fork in the index.
    await addOverview(t, { userId: owner, notebookId, audioStorageId: storageId });

    expect((await resolve(t, owner, storageId))?.url).toBeTruthy();
    expect(await resolve(t, stranger, storageId)).toBeNull();
  });

  test("passes full URLs through unchanged", async () => {
    const t = convexTest(schema, modules);
    const { stranger } = await seed(t);

    expect(await resolve(t, stranger, "https://cdn.example.com/a.mp3")).toEqual({
      url: "https://cdn.example.com/a.mp3",
    });
    expect(await resolve(t, stranger, "HTTPS://cdn.example.com/a.mp3")).toEqual({
      url: "HTTPS://cdn.example.com/a.mp3",
    });
  });

  test("returns null when signed out", async () => {
    const t = convexTest(schema, modules);
    const { storageId } = await seed(t);

    expect(
      await t.query(api.studio.audio.index.resolveRawAudioUrl, { audioUrl: storageId })
    ).toBeNull();
  });
});
