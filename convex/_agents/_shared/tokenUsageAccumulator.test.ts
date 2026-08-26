import { describe, expect, it } from "vitest";
import { createTokenUsageAccumulator } from "./tokenUsageAccumulator";

describe("createTokenUsageAccumulator", () => {
  it("sums every recorded provider call and resets on consume", () => {
    const acc = createTokenUsageAccumulator();
    acc.add({ prompt: 10, completion: 5, total: 15 });
    acc.add({ prompt: 20, completion: 8, total: 28 });
    acc.add(undefined);
    acc.add({ prompt: 0, completion: 0, total: 0 });

    expect(acc.consume()).toEqual({ prompt: 30, completion: 13, total: 43 });
    expect(acc.consume()).toBeUndefined();
  });

  it("returns undefined when nothing was recorded", () => {
    const acc = createTokenUsageAccumulator();
    expect(acc.consume()).toBeUndefined();
  });
});
