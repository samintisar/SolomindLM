import { describe, expect, it, vi } from "vitest";
import { createDiscoverSources, discoverChatExternalSources } from "./_streamSources";
import type { StreamSourcePolicy } from "./stream";

describe("createDiscoverSources", () => {
  it("returns empty array when no channels match", async () => {
    const ctx = {
      runAction: vi.fn().mockResolvedValue([]),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["notebook"] };
    const discover = createDiscoverSources(ctx, policy);
    const results = await discover("test query", []);

    expect(results).toEqual([]);
    expect(ctx.runAction).not.toHaveBeenCalled();
  });

  it("discovers web sources via Tavily", async () => {
    const ctx = {
      runAction: vi
        .fn()
        .mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
          if (args.topic === "general") {
            return [
              { title: "Web Result", url: "https://example.com", snippet: "Hello", score: 0.9 },
            ];
          }
          return [];
        }),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["web"] };
    const discover = createDiscoverSources(ctx, policy);
    const results = await discover("query", ["web"]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Web Result",
      url: "https://example.com",
      snippet: "Hello",
      sourceType: "web",
      score: 0.9,
    });
  });

  it("handles Tavily failures gracefully", async () => {
    const warn = vi.fn();
    const ctx = {
      runAction: vi.fn().mockRejectedValue(new Error("Tavily down")),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["web"] };
    const discover = createDiscoverSources(ctx, policy, { log: { warn } });
    const results = await discover("query", ["web"]);

    expect(results).toEqual([]);
    expect(warn).toHaveBeenCalledWith("web_search_failed", expect.any(Object));
  });

  it("sorts and caps results for chat", async () => {
    const ctx = {
      runAction: vi.fn().mockResolvedValue([]),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["web", "news"] };
    const sources = await discoverChatExternalSources(ctx, "query", policy, {
      info: vi.fn(),
      warn: vi.fn(),
    });

    expect(sources.sources.length).toBeLessThanOrEqual(5);
  });
});

describe("discoverChatExternalSources chunking", () => {
  it("builds chunks from rawContent when available", async () => {
    const rawContent = "a".repeat(5000);
    const ctx = {
      runAction: vi
        .fn()
        .mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
          if (args.topic === "general") {
            return [
              {
                title: "Deep Article",
                url: "https://example.com/deep",
                snippet: "Short",
                score: 0.95,
                rawContent,
              },
            ];
          }
          return [];
        }),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["web"] };
    const { chunks } = await discoverChatExternalSources(ctx, "query", policy, {
      info: vi.fn(),
      warn: vi.fn(),
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0].content.length).toBeGreaterThan(3000);
    expect(chunks[0].content).toContain("---");
  });

  it("falls back to snippet when rawContent is too short", async () => {
    const ctx = {
      runAction: vi
        .fn()
        .mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
          if (args.topic === "general") {
            return [
              {
                title: "Brief",
                url: "https://example.com",
                snippet: "This is a reasonably long snippet that should be used.",
                score: 0.8,
                rawContent: "short",
              },
            ];
          }
          return [];
        }),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["web"] };
    const { chunks } = await discoverChatExternalSources(ctx, "query", policy, {
      info: vi.fn(),
      warn: vi.fn(),
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("reasonably long snippet");
  });

  it("excludes results with neither rawContent nor sufficient snippet", async () => {
    const ctx = {
      runAction: vi.fn().mockResolvedValue([
        {
          title: "Empty",
          url: "https://example.com",
          snippet: "hi",
          score: 0.5,
        },
      ]),
    } as unknown as Parameters<typeof createDiscoverSources>[0];

    const policy: StreamSourcePolicy = { channels: ["web"] };
    const { chunks } = await discoverChatExternalSources(ctx, "query", policy, {
      info: vi.fn(),
      warn: vi.fn(),
    });

    expect(chunks).toEqual([]);
  });
});
