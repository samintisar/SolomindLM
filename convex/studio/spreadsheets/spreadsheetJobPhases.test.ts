import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJobDeadline } from "../_job/jobDeadline";
import { invokeWithinBudget, recursiveCollapse } from "./spreadsheetJobPhases";

const { invokeTogetherText } = vi.hoisted(() => ({ invokeTogetherText: vi.fn() }));

vi.mock("../../_agents/_shared/studioTextLlm", () => ({ invokeTogetherText }));

const SEPARATOR = "\n\n---\n\n";
// ~10k estimated tokens each (4 chars/token), so any two exceed the 15k collapse target.
const bigOutput = (tag: string) => tag.repeat(40_000);

function fakeClock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

beforeEach(() => {
  invokeTogetherText.mockReset();
});

describe("recursiveCollapse", () => {
  it("hands outputs to reduce as-is without any LLM call once the collapse budget is spent", async () => {
    const outputs = ["a", "b", "c"].map(bigOutput);

    const result = await recursiveCollapse(outputs, "data_table", "", createJobDeadline(0));

    expect(result).toEqual(outputs);
    expect(invokeTogetherText).not.toHaveBeenCalled();
  });

  it("passes a trailing singleton group through without collapsing it", async () => {
    invokeTogetherText.mockResolvedValue("collapsed");
    const outputs = ["a", "b", "c"].map(bigOutput);

    const result = await recursiveCollapse(outputs, "data_table", "", createJobDeadline(540_000));

    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["collapsed", outputs[2]]);
  });

  it("skips groups that start after the budget has run low instead of firing doomed calls", async () => {
    const clock = fakeClock();
    const deadline = createJobDeadline(540_000, clock.now);
    // The first collapse call uses up most of the budget; groups that start after it
    // must fall back to their uncollapsed text rather than call the LLM.
    invokeTogetherText.mockImplementation(async () => {
      clock.advance(250_000);
      return "collapsed";
    });
    const outputs = ["a", "b", "c", "d", "e", "f"].map(bigOutput);

    const result = await recursiveCollapse(outputs, "data_table", "", deadline);

    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      "collapsed",
      [outputs[2], outputs[3]].join(SEPARATOR),
      [outputs[4], outputs[5]].join(SEPARATOR),
    ]);
  });
});

describe("invokeWithinBudget", () => {
  it("retries a retryable failure while budget remains", async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValue("ok");

    await expect(
      invokeWithinBudget({ invoke, timeoutMs: 5_000, phaseLabel: "Test" })
    ).resolves.toBe("ok");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not start another attempt once the shared budget is spent", async () => {
    // The retry backoff (1s) outlasts the 200ms budget, so the retry must not call invoke.
    const invoke = vi.fn().mockRejectedValue(new Error("HTTP 503"));

    await expect(
      invokeWithinBudget({ invoke, timeoutMs: 200, phaseLabel: "Test" })
    ).rejects.toThrow("Test timeout after 200ms");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
