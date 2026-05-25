import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { ARXIV_MIN_INTERVAL_MS, tryAcquireArxivSlot } from "./arxivThrottle";

const modules = import.meta.glob("../**/*.ts");

describe("arxivThrottle", () => {
  it("acquires slot when empty", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(tryAcquireArxivSlot, {});
    expect(result.acquired).toBe(true);
    expect(result.waitMs).toBe(0);
  });

  it("rejects rapid consecutive acquires", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(tryAcquireArxivSlot, {});
    const second = await t.mutation(tryAcquireArxivSlot, {});
    expect(second.acquired).toBe(false);
    expect(second.waitMs).toBeGreaterThan(0);
    expect(second.waitMs).toBeLessThanOrEqual(ARXIV_MIN_INTERVAL_MS);
  });
});
