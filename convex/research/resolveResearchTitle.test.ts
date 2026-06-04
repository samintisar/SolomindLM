import { describe, expect, it, vi } from "vitest";
import { resolveResearchTitle } from "./resolveResearchTitle";

describe("resolveResearchTitle", () => {
  it("returns normalized plan title when provided", async () => {
    const ctx = { runAction: vi.fn() } as never;
    const title = await resolveResearchTitle(ctx, {
      query: "rag evaluation",
      researchTitle: "  My Custom Title  ",
    });
    expect(title).toBe("My Custom Title");
    expect(ctx.runAction).not.toHaveBeenCalled();
  });

  it("falls back to query heuristic when title generation fails", async () => {
    const ctx = {
      runAction: vi.fn().mockRejectedValue(new Error("LLM down")),
    } as never;
    const title = await resolveResearchTitle(ctx, {
      query: "How do retrieval pipelines compare?",
      finalResponse: "## Abstract\n\nSome content.",
    });
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toBe("");
  });
});
