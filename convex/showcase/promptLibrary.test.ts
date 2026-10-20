/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { SHOWCASE_PROMPTS } from "./promptPacks";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./showcase/promptLibrary.ts"]);

const OWNER = "maintainer@example.com";
const PROMPT_COUNT = Object.keys(SHOWCASE_PROMPTS).length;

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) =>
    ctx.db.insert("users", { email: OWNER, name: "Maintainer" })
  );
  const prompts = () =>
    t.run((ctx) =>
      ctx.db
        .query("studioPrompts")
        .withIndex("by_user", (q) => q.eq("userId", ownerId))
        .collect()
    );
  return { t, ownerId, prompts };
}

describe("showcase prompt library", () => {
  test("saves every pack prompt once, private until published", async () => {
    const { t, prompts } = await setup();
    const sync = (publish: boolean) =>
      t.mutation(internal.showcase.promptLibrary.syncShowcasePrompts, {
        ownerEmail: OWNER,
        publish,
      });

    expect(await sync(false)).toHaveLength(PROMPT_COUNT);
    expect(await sync(false)).toEqual([]);
    const saved = await prompts();
    expect(saved).toHaveLength(PROMPT_COUNT);
    expect(saved.every((p) => p.visibility === "private" && p.status === "active")).toBe(true);
    const quiz = saved.find((p) => p.title === SHOWCASE_PROMPTS["code.quiz"].title);
    expect(quiz).toMatchObject({
      studioTool: "quiz",
      promptText: SHOWCASE_PROMPTS["code.quiz"].text,
    });

    expect(await sync(true)).toHaveLength(PROMPT_COUNT);
    const published = await prompts();
    expect(published).toHaveLength(PROMPT_COUNT);
    expect(published.every((p) => p.visibility === "public" && p.publishedAt)).toBe(true);
    // A later unpublished run doesn't take them back off the library.
    expect(await sync(false)).toEqual([]);

    expect(
      await t.mutation(internal.showcase.promptLibrary.unpublishShowcasePrompts, {
        ownerEmail: OWNER,
      })
    ).toHaveLength(PROMPT_COUNT);
    expect((await prompts()).every((p) => p.visibility === "private")).toBe(true);
  });

  test("updates an edited prompt in place and leaves the owner's other prompts alone", async () => {
    const { t, ownerId, prompts } = await setup();
    const now = Date.now();
    const insert = (title: string, extra: { sourcePromptId?: Id<"studioPrompts"> } = {}) =>
      t.run((ctx) =>
        ctx.db.insert("studioPrompts", {
          userId: ownerId,
          title,
          promptText: "old text",
          studioTool: "quiz",
          visibility: "private",
          status: "active",
          createdAt: now,
          updatedAt: now,
          ...extra,
        })
      );
    const stale = await insert(SHOWCASE_PROMPTS["code.quiz"].title);
    const mine = await insert("My own quiz prompt");
    // A saved copy of someone's public prompt with the same title isn't the owner's to edit.
    const copy = await insert(SHOWCASE_PROMPTS["exam.quiz"].title, { sourcePromptId: mine });

    await t.mutation(internal.showcase.promptLibrary.syncShowcasePrompts, {
      ownerEmail: OWNER,
      publish: false,
    });
    const rows = await prompts();
    expect(rows).toHaveLength(PROMPT_COUNT + 2);
    const byId = new Map(rows.map((r) => [r._id, r]));
    expect(byId.get(stale)?.promptText).toBe(SHOWCASE_PROMPTS["code.quiz"].text);
    expect(byId.get(mine)?.promptText).toBe("old text");
    expect(byId.get(copy)?.promptText).toBe("old text");
  });
});
