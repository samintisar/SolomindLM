import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import {
  SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS,
  SEMANTIC_SCHOLAR_UNAUTHENTICATED_INTERVAL_MS,
  tryAcquireSemanticScholarSlot,
} from "./semanticScholarThrottle";

const modules = import.meta.glob("../**/*.ts");

describe("semanticScholarThrottle config", () => {
  it("targets 1 RPS with API key per Semantic Scholar introductory limits", () => {
    expect(SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS).toBe(1000);
    expect(SEMANTIC_SCHOLAR_UNAUTHENTICATED_INTERVAL_MS).toBeGreaterThan(
      SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS
    );
  });
});

describe("tryAcquireSemanticScholarSlot", () => {
  it("acquires on empty table", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(tryAcquireSemanticScholarSlot, {});
    expect(result.acquired).toBe(true);
  });

  it("rejects when called again within min interval", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(tryAcquireSemanticScholarSlot, {});
    const second = await t.mutation(tryAcquireSemanticScholarSlot, {});
    expect(second.acquired).toBe(false);
    expect(second.waitMs).toBeGreaterThan(0);
  });

  it("dedupes duplicate throttle rows", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("semanticScholarThrottle", { lastRequestAt: 100 });
      await ctx.db.insert("semanticScholarThrottle", { lastRequestAt: 200 });
    });
    const result = await t.mutation(tryAcquireSemanticScholarSlot, {});
    expect(result.acquired).toBe(true);
    const rows = await t.run(async (ctx) => ctx.db.query("semanticScholarThrottle").collect());
    expect(rows).toHaveLength(1);
  });
});
