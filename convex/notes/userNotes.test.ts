/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { uncachedLlmCall } from "../_agents/_shared/cachedLlm";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

vi.mock("../_agents/_shared/cachedLlm", () => ({ uncachedLlmCall: vi.fn() }));

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./notes/userNotes.ts", "./_services/ai/titleGenerator.ts"]);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

const MESSAGES = [
  { role: "user", content: "What is photosynthesis?" },
  { role: "assistant", content: "How plants make sugar from light." },
];

async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Plants",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    return { owner, viewer, notebookId };
  });
  return { t, ...ids };
}

beforeEach(() => {
  vi.mocked(uncachedLlmCall).mockReset();
  vi.mocked(uncachedLlmCall).mockResolvedValue({ content: "Photosynthesis basics" } as never);
});

describe("notes.userNotes.saveChat", () => {
  test("a viewer of a public notebook is refused before any title is generated", async () => {
    const { t, viewer, notebookId } = await setup();

    await expect(
      withAuth(t, viewer).action(api.notes.userNotes.saveChat, {
        notebookId,
        messages: MESSAGES,
        messageCount: MESSAGES.length,
      })
    ).rejects.toThrow("Access denied");
    expect(uncachedLlmCall).not.toHaveBeenCalled();
  });

  test("the owner saves the chat as a note", async () => {
    const { t, owner, notebookId } = await setup();

    const note = await withAuth(t, owner).action(api.notes.userNotes.saveChat, {
      notebookId,
      messages: MESSAGES,
      messageCount: MESSAGES.length,
    });

    expect(note).toMatchObject({ status: expect.any(String) });
    const saved = await t.run((ctx) => ctx.db.get(note._id as Id<"notes">));
    expect(saved).toMatchObject({ type: "chat", userId: owner, notebookId });
  });
});
