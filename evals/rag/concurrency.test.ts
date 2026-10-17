import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("keeps results in input order even when calls finish out of order", async () => {
    const results = await mapWithConcurrency([30, 5, 20, 1], 4, async (ms, i) => {
      await sleep(ms);
      return `${i}:${ms}`;
    });

    expect(results).toEqual(["0:30", "1:5", "2:20", "3:1"]);
  });

  it("never runs more than the limit at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: number[] = [];

    await mapWithConcurrency(
      Array.from({ length: 7 }, (_, i) => i),
      3,
      async (item) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(5);
        seen.push(item);
        inFlight--;
      }
    );

    expect(maxInFlight).toBe(3);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("handles a limit larger than the item count and an empty list", async () => {
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n * 2)).toEqual([2, 4]);
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it("rejects a limit that is not a positive integer", async () => {
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow(RangeError);
    await expect(mapWithConcurrency([1], 1.5, async () => 1)).rejects.toThrow(RangeError);
  });

  it("starts no new item after one fails", async () => {
    const started: number[] = [];

    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 1, async (item) => {
        started.push(item);
        if (item === 2) throw new Error("boom");
        return item;
      })
    ).rejects.toThrow("boom");

    expect(started).toEqual([1, 2]);
  });
});
