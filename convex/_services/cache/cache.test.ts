import { describe, it, expect, vi } from "vitest";
import { CACHE_TTL, withJitter } from "./cache";

describe("CACHE_TTL", () => {
  it("defines expected cache durations", () => {
    expect(CACHE_TTL.agent).toBe(60 * 60 * 1000);
    expect(CACHE_TTL.embedding).toBe(7 * 24 * 60 * 60 * 1000);
    expect(CACHE_TTL.rerank).toBe(15 * 60 * 1000);
    expect(CACHE_TTL.notebookList).toBe(5 * 60 * 1000);
  });
});

describe("withJitter", () => {
  it("returns value within ±10% of base by default", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // zero jitter at midpoint
    expect(withJitter(1000)).toBe(1000);
    vi.restoreAllMocks();
  });

  it("applies positive jitter at random=1", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(withJitter(1000, 0.1)).toBe(1100);
    vi.restoreAllMocks();
  });

  it("applies negative jitter at random=0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(withJitter(1000, 0.1)).toBe(900);
    vi.restoreAllMocks();
  });
});
