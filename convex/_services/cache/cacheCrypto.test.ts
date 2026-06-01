import { describe, expect, it } from "vitest";
import { generateAgentCacheKey, generateEmbeddingCacheKey, hashInput } from "./cacheCrypto";

describe("hashInput", () => {
  it("returns a stable 16-char hex prefix", async () => {
    const a = await hashInput("hello");
    const b = await hashInput("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs for different inputs", async () => {
    const a = await hashInput("a");
    const b = await hashInput("b");
    expect(a).not.toBe(b);
  });
});

describe("generateAgentCacheKey", () => {
  it("includes agent type, version, and hash", async () => {
    const key = await generateAgentCacheKey("report", "v3", { topic: "AI", count: 2 });
    expect(key).toMatch(/^report:v3:[0-9a-f]{16}$/);
  });

  it("is stable regardless of param key order", async () => {
    const a = await generateAgentCacheKey("quiz", "v1", { b: 2, a: 1 });
    const b = await generateAgentCacheKey("quiz", "v1", { a: 1, b: 2 });
    expect(a).toBe(b);
  });
});

describe("generateEmbeddingCacheKey", () => {
  it("prefixes embedding keys", async () => {
    const key = await generateEmbeddingCacheKey("chunk text");
    expect(key).toMatch(/^embedding:[0-9a-f]{16}$/);
  });
});
