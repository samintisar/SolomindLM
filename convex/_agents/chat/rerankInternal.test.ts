/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import { env } from "../../_lib/env";
import { preloadModules } from "../../_testing/preloadModules.helpers";
import schema from "../../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

preloadModules(modules, ["./_agents/chat/rerankCache.ts"]);

const args = { query: "cats", documents: ["bread", "cats eat meat"], topN: 2 };
const originalKey = env.VOYAGE_API_KEY;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  env.VOYAGE_API_KEY = originalKey;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rerankInternal", () => {
  it("fails loudly, without calling Voyage, when VOYAGE_API_KEY is not configured", async () => {
    env.VOYAGE_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    await expect(t.action(internal._agents.chat.rerankCache.rerankInternal, args)).rejects.toThrow(
      /VOYAGE_API_KEY is not configured/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Voyage's index and score pairs when configured", async () => {
    env.VOYAGE_API_KEY = "pa-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            { index: 1, relevance_score: 0.8 },
            { index: 0, relevance_score: 0.3 },
          ],
        })
      )
    );
    const t = convexTest(schema, modules);

    const result = await t.action(internal._agents.chat.rerankCache.rerankInternal, args);

    expect(result).toEqual([
      { index: 1, relevance_score: 0.8 },
      { index: 0, relevance_score: 0.3 },
    ]);
  });
});
