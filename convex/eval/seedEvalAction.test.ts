/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const OWNER = "owner@example.com";
const SECRET = "s".repeat(24);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RAG_EVALS_ENABLED", "true");
  vi.stubEnv("RAG_EVAL_SECRET", SECRET);
  vi.stubEnv("RAG_EVAL_OWNER_EMAIL", OWNER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Owner" }));
  return t;
}

describe("seedEvalAction gate", () => {
  test("every action rejects a wrong secret", async () => {
    const t = await setup();
    const bad = "x".repeat(24);
    await expect(
      t.action(api.eval.seedEvalAction.resolvePackNotebook, { evalSecret: bad, notebookTitle: "A" })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.createPackNotebook, { evalSecret: bad, notebookTitle: "A" })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.getEvalUploadUrl, { evalSecret: bad })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.getPackSourceText, { evalSecret: bad, documentIds: [] })
    ).rejects.toThrow(/Invalid eval credentials/);
  });

  test("a wrong secret cannot add or remove pack documents", async () => {
    const t = await setup();
    const bad = "x".repeat(24);
    const notebookId = await t.action(api.eval.seedEvalAction.createPackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Gate Pack",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["# Gate"])));
    const documentId = await t.action(api.eval.seedEvalAction.addPackDocument, {
      evalSecret: SECRET,
      notebookId,
      storageId,
      fileName: "keep.md",
      contentType: "text/markdown",
      fileSize: 6,
      sha256: "keep",
    });
    const spare = await t.run((ctx) => ctx.storage.store(new Blob(["# Spare"])));

    await expect(
      t.action(api.eval.seedEvalAction.addPackDocument, {
        evalSecret: bad,
        notebookId,
        storageId: spare,
        fileName: "spare.md",
        contentType: "text/markdown",
        fileSize: 7,
        sha256: "spare",
      })
    ).rejects.toThrow(/Invalid eval credentials/);
    await expect(
      t.action(api.eval.seedEvalAction.removePackDocument, { evalSecret: bad, documentId })
    ).rejects.toThrow(/Invalid eval credentials/);

    const docs = await t.run((ctx) => ctx.db.query("documents").collect());
    expect(docs.map((d) => d._id)).toEqual([documentId]);
  });

  test("rejects every call when RAG_EVALS_ENABLED is not true", async () => {
    const t = await setup();
    vi.stubEnv("RAG_EVALS_ENABLED", "false");
    await expect(
      t.action(api.eval.seedEvalAction.resolvePackNotebook, {
        evalSecret: SECRET,
        notebookTitle: "A",
      })
    ).rejects.toThrow(/RAG evals are disabled/);
  });

  test("explains a missing RAG_EVAL_OWNER_EMAIL", async () => {
    const t = await setup();
    vi.stubEnv("RAG_EVAL_OWNER_EMAIL", "");
    await expect(
      t.action(api.eval.seedEvalAction.resolvePackNotebook, {
        evalSecret: SECRET,
        notebookTitle: "A",
      })
    ).rejects.toThrow(/RAG_EVAL_OWNER_EMAIL is not set/);
  });
});

describe("seedEvalAction round trip", () => {
  test("creates a pack notebook, adds and removes a document", async () => {
    const t = await setup();
    const notebookId = await t.action(api.eval.seedEvalAction.createPackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Medical Students",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["# Cardiology"])));
    const documentId = await t.action(api.eval.seedEvalAction.addPackDocument, {
      evalSecret: SECRET,
      notebookId,
      storageId,
      fileName: "cardiology.md",
      contentType: "text/markdown",
      fileSize: 12,
      sha256: "abc",
    });

    const resolved = await t.action(api.eval.seedEvalAction.resolvePackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Medical Students",
    });
    expect(resolved?.notebookId).toBe(notebookId);
    expect(resolved?.docs.map((d) => [d.documentId, d.sha256])).toEqual([[documentId, "abc"]]);

    // Ingestion must have finished before a document can be replaced.
    await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
    await t.action(api.eval.seedEvalAction.removePackDocument, { evalSecret: SECRET, documentId });
    const after = await t.action(api.eval.seedEvalAction.resolvePackNotebook, {
      evalSecret: SECRET,
      notebookTitle: "Medical Students",
    });
    expect(after?.docs).toEqual([]);
  });
});
