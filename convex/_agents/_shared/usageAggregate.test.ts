import { describe, expect, it } from "vitest";
import { addTokenUsage } from "./usageAggregate";

describe("addTokenUsage", () => {
  it("sums two usages", () => {
    expect(
      addTokenUsage(
        { prompt: 10, completion: 20, total: 30 },
        { prompt: 5, completion: 7, total: 12 }
      )
    ).toEqual({ prompt: 15, completion: 27, total: 42 });
  });

  it("treats undefined as zero", () => {
    expect(addTokenUsage(undefined, { prompt: 3, completion: 4, total: 7 })).toEqual({
      prompt: 3,
      completion: 4,
      total: 7,
    });
    expect(addTokenUsage({ prompt: 1, completion: 2, total: 3 }, undefined)).toEqual({
      prompt: 1,
      completion: 2,
      total: 3,
    });
    expect(addTokenUsage(undefined, undefined)).toEqual({
      prompt: 0,
      completion: 0,
      total: 0,
    });
  });
});
