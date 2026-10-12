/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/internal.ts"]);

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebook = (title: string) =>
      ctx.db.insert("notebooks", { userId, title, createdAt: Date.now(), updatedAt: Date.now() });
    const mine = await notebook("Mine");
    const other = await notebook("Other");
    const doc = (notebookId: Id<"notebooks">, fileName: string) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName,
        fileType: "file",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    const a = await doc(mine, "a.pdf");
    const b = await doc(mine, "b.pdf");
    const elsewhere = await doc(other, "secret.pdf");
    const deleted = await doc(mine, "gone.pdf");
    await ctx.db.delete(deleted);
    return { mine, a, b, elsewhere, deleted };
  });
}

// #450: chat names selected sources and checks they belong to the notebook, reading only the
// selected rows.
describe("listNotebookDocumentTitles", () => {
  test("returns the titles of the selected documents that are in the notebook", async () => {
    const t = convexTest(schema, modules);
    const { mine, a, b, elsewhere, deleted } = await seed(t);

    const rows = await t.query(internal.documents.internal.listNotebookDocumentTitles, {
      notebookId: mine,
      documentIds: [a, elsewhere, deleted, "not-an-id", b, a],
    });

    expect(rows).toEqual([
      { _id: a, fileName: "a.pdf" },
      { _id: b, fileName: "b.pdf" },
    ]);
  });
});
