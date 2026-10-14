/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
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
