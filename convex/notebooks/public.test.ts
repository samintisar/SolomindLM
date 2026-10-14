/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const ADMIN_EMAIL = "admin@example.com";

// `convex/_lib/env.ts` snapshots `process.env` when it first evaluates (once per test file, in
// `preloadModules`' beforeAll), so the admin allowlist must be stubbed at module scope.
vi.stubEnv("FEEDBACK_ADMIN_EMAILS", ADMIN_EMAIL);

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./notebooks/public.ts"]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function setup() {
  const t = convexTest(schema, modules);
  // convex-test does not auto-register components; `forkPublic` calls the rate limiter.
  registerRateLimiter(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Ada", email: "ada@example.com" });
    const other = await ctx.db.insert("users", { name: "Bo", email: "bo@example.com" });
    const admin = await ctx.db.insert("users", { name: "Admin", email: ADMIN_EMAIL });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Econ",
      createdAt: now,
      updatedAt: now,
    });
    return { owner, other, admin, notebookId };
  });
  return { t, ...ids };
}

describe("notebooks.public", () => {
  test("only the owner can publish", async () => {
    const { t, other, notebookId } = await setup();
    await expect(
      withAuth(t, other).mutation(api.notebooks.public.setPublic, { notebookId, isPublic: true })
    ).rejects.toThrow("Notebook not found");
  });

  test("published notebooks appear in listPublic; private ones don't", async () => {
    const { t, owner, other, notebookId } = await setup();
    const before = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(before.page).toEqual([]);

    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const after = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(after.page.map((n) => n.id)).toEqual([notebookId]);
    expect(after.page[0].ownerName).toBe("Ada");
    expect(after.page[0].isOwnedByViewer).toBe(false);
  });

  test("public cards carry no source count and no owner email", async () => {
    const { t, owner, other, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const { page } = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page[0]).not.toHaveProperty("sourceCount");
    expect(JSON.stringify(page[0])).not.toContain("ada@example.com");
  });

  test("publishing an already public notebook keeps its publishedAt", async () => {
    const { t, owner, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const first = (await t.run((ctx) => ctx.db.get(notebookId)))?.publishedAt;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 60_000);
      await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
        notebookId,
        isPublic: true,
      });
    } finally {
      vi.useRealTimers();
    }
    expect((await t.run((ctx) => ctx.db.get(notebookId)))?.publishedAt).toBe(first);
  });

  test("an editor cannot unpublish the owner's notebook", async () => {
    const { t, owner, other, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("notebookMembers", {
        notebookId,
        userId: other,
        role: "editor",
        joinedAt: Date.now(),
      })
    );
    await expect(
      withAuth(t, other).mutation(api.notebooks.public.setPublic, { notebookId, isPublic: false })
    ).rejects.toThrow("Notebook not found");
    expect((await t.run((ctx) => ctx.db.get(notebookId)))?.isPublic).toBe(true);
  });

  test("signed-out callers get empty public lists", async () => {
    const { t, owner, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const community = await t.query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(community.page).toEqual([]);
    expect(await t.query(api.notebooks.public.listFeatured, {})).toEqual([]);
  });

  test("listFeatured skips a featured row that is no longer public", async () => {
    const { t, other, notebookId } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(notebookId, { isFeatured: true, isPublic: false, publishedAt: Date.now() })
    );
    expect(await withAuth(t, other).query(api.notebooks.public.listFeatured, {})).toEqual([]);
  });

  test("unpublishing clears featured", async () => {
    const { t, owner, admin, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await withAuth(t, admin).mutation(api.notebooks.public.setFeatured, {
      notebookId,
      isFeatured: true,
    });
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: false,
    });
    const nb = await t.run((ctx) => ctx.db.get(notebookId));
    expect(nb?.isPublic).toBe(false);
    expect(nb?.isFeatured).toBe(false);
  });

  test("featured notebooks move from Community to listFeatured", async () => {
    const { t, owner, admin, other, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await withAuth(t, admin).mutation(api.notebooks.public.setFeatured, {
      notebookId,
      isFeatured: true,
    });
    const featured = await withAuth(t, other).query(api.notebooks.public.listFeatured, {});
    expect(featured.map((n) => n.id)).toEqual([notebookId]);
    const community = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(community.page).toEqual([]);
  });

  test("non-admins cannot feature; private notebooks cannot be featured", async () => {
    const { t, owner, admin, notebookId } = await setup();
    await expect(
      withAuth(t, owner).mutation(api.notebooks.public.setFeatured, {
        notebookId,
        isFeatured: true,
      })
    ).rejects.toThrow("Not authorized");
    await expect(
      withAuth(t, admin).mutation(api.notebooks.public.setFeatured, {
        notebookId,
        isFeatured: true,
      })
    ).rejects.toThrow("Only public notebooks can be featured");
  });

  test("admins can unpublish someone else's notebook", async () => {
    const { t, owner, admin, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await withAuth(t, admin).mutation(api.notebooks.public.adminUnpublish, { notebookId });
    expect((await t.run((ctx) => ctx.db.get(notebookId)))?.isPublic).toBe(false);
  });

  test("non-admins cannot use adminUnpublish", async () => {
    const { t, owner, other, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await expect(
      withAuth(t, other).mutation(api.notebooks.public.adminUnpublish, { notebookId })
    ).rejects.toThrow("Not authorized");
    expect((await t.run((ctx) => ctx.db.get(notebookId)))?.isPublic).toBe(true);
  });

  test("forkPublic refuses a caller at the notebook limit", async () => {
    const { t, owner, other, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const ownedByOther = async () =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("notebooks")
            .withIndex("by_user", (q) => q.eq("userId", other))
            .collect()
        )
      ).length;
    await t.run(async (ctx) => {
      // The free plan allows five notebooks.
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("notebooks", {
          userId: other,
          title: `Notebook ${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const error = await withAuth(t, other)
      .mutation(api.notebooks.public.forkPublic, { notebookId })
      .then(
        () => null,
        (e: unknown) => e
      );

    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data.code).toBe("NOTEBOOK_LIMIT_REACHED");
    expect(await ownedByOther()).toBe(5);
  });

  test("forkPublic copies a public notebook and refuses a private one", async () => {
    const { t, owner, other, notebookId } = await setup();
    await expect(
      withAuth(t, other).mutation(api.notebooks.public.forkPublic, { notebookId })
    ).rejects.toThrow("Notebook not found");

    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const { newNotebookId } = await withAuth(t, other).mutation(api.notebooks.public.forkPublic, {
      notebookId,
    });
    const fork = await t.run((ctx) => ctx.db.get(newNotebookId));
    expect(fork?.userId).toBe(other);
    expect(fork?.isPublic).toBeUndefined();
  });
});
