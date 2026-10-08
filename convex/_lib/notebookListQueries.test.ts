/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

/**
 * Regression: the web app calls these list queries reactively with the notebook id taken from the
 * URL. A deleted notebook, or one the signed-in user cannot read, used to make them throw a plain
 * `Error`. Convex redacts that to "Server Error" in production and `useQuery` rethrows it during
 * render, which crashed the whole app. Every reactive notebook-scoped list must degrade to "empty".
 */

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./documents/index.ts",
  "./documents/listSummary.ts",
  "./chat/conversations.ts",
  "./chat/messages.ts",
  "./notes/userNotes.ts",
  "./studio/quizzes/index.ts",
  "./studio/mindmaps/index.ts",
  "./studio/infographic/index.ts",
  "./studio/writtenQuestions/index.ts",
  "./studio/flashcards/index.ts",
  "./studio/reports/index.ts",
  "./studio/literature_tables/index.ts",
]);

type T = ReturnType<typeof convexTest>;

const EMPTY_CHAT = { messages: [], chatGenerating: false, chatGenerationStartedAt: null };

const NOTEBOOK_LIST_QUERIES = [
  { name: "documents.index.list", fn: api.documents.index.list, empty: [] },
  {
    name: "documents.listSummary.listSummary",
    fn: api.documents.listSummary.listSummary,
    empty: [],
  },
  {
    name: "chat.conversations.listForNotebook",
    fn: api.chat.conversations.listForNotebook,
    empty: [],
  },
  { name: "chat.messages.listByNotebook", fn: api.chat.messages.listByNotebook, empty: EMPTY_CHAT },
  { name: "notes.userNotes.list", fn: api.notes.userNotes.list, empty: [] },
  { name: "studio.quizzes.index.list", fn: api.studio.quizzes.index.list, empty: [] },
  { name: "studio.mindmaps.index.list", fn: api.studio.mindmaps.index.list, empty: [] },
  { name: "studio.infographic.index.list", fn: api.studio.infographic.index.list, empty: [] },
  {
    name: "studio.writtenQuestions.index.list",
    fn: api.studio.writtenQuestions.index.list,
    empty: [],
  },
  { name: "studio.flashcards.index.list", fn: api.studio.flashcards.index.list, empty: [] },
  { name: "studio.reports.index.list", fn: api.studio.reports.index.list, empty: [] },
  {
    name: "studio.literature_tables.index.getLiteratureTablesByNotebook",
    fn: api.studio.literature_tables.index.getLiteratureTablesByNotebook,
    empty: [],
  },
  {
    name: "studio.literature_tables.index.getLiteratureReportsByNotebook",
    fn: api.studio.literature_tables.index.getLiteratureReportsByNotebook,
    empty: [],
  },
] as const;

function withAuth(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedNotebook(t: T, userId: Id<"users">): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

/** Calls a query with only a notebook id; the ref union is too wide for a typed call. */
async function callList(
  client: ReturnType<typeof withAuth>,
  fn: (typeof NOTEBOOK_LIST_QUERIES)[number]["fn"],
  notebookId: Id<"notebooks">
): Promise<unknown> {
  return (
    client.query as unknown as (
      ref: unknown,
      args: { notebookId: Id<"notebooks"> }
    ) => Promise<unknown>
  )(fn, { notebookId });
}

describe.each(NOTEBOOK_LIST_QUERIES)("$name", ({ fn, empty }) => {
  test("returns empty for a deleted notebook instead of throwing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await t.run(async (ctx) => ctx.db.delete(notebookId));

    await expect(callList(withAuth(t, userId), fn, notebookId)).resolves.toEqual(empty);
  });

  test("returns empty for a notebook the user cannot access instead of throwing", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const strangerId = await seedUser(t);
    const notebookId = await seedNotebook(t, ownerId);

    await expect(callList(withAuth(t, strangerId), fn, notebookId)).resolves.toEqual(empty);
  });

  test("still resolves for the notebook owner", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);

    await expect(callList(withAuth(t, userId), fn, notebookId)).resolves.toBeDefined();
  });
});
