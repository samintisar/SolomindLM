import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJobDeadline } from "../../studio/_job/jobDeadline";
import type { JobLogger } from "../_shared/logging";
import { type CollapseReduceDeps, recursiveCollapse } from "./collapseReduceLlm";
import type { Flashcard } from "./prompts";

const { invokeCollapse } = vi.hoisted(() => ({ invokeCollapse: vi.fn() }));

vi.mock("./structuredLlm", () => ({
  createStructuredLLM: () => ({ invoke: invokeCollapse }),
}));

const cards = (tag: string, count = 20): Flashcard[] =>
  Array.from({ length: count }, (_, i) => ({
    front: `Which term names concept ${tag}${i}?`,
    back: `Term ${tag}${i}`,
  }));

function fakeClock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function makeDeps(budgetMs: number, now?: () => number): CollapseReduceDeps {
  return {
    smartLlm: { model: "test-model" } as CollapseReduceDeps["smartLlm"],
    // Every map output "costs" 6k tokens, so any two exceed the 10k collapse target.
    estimateTokens: () => 6_000,
    logger: { info: vi.fn(), warn: vi.fn() } as unknown as JobLogger,
    deadline: createJobDeadline(budgetMs, now),
  };
}

/** The LLM gives back every card it was sent: the worst case for convergence. */
function echoCollapse() {
  invokeCollapse.mockImplementation(async (messages: Array<{ content: unknown }>) => {
    const prompt = String(messages[1].content);
    const fronts = [...prompt.matchAll(/Which term names concept (\w+)\?/g)].map((m) => m[1]);
    return {
      flashcards: fronts.map((id) => ({
        front: `Which term names concept ${id}?`,
        back: `Term ${id}`,
      })),
    };
  });
}

beforeEach(() => {
  invokeCollapse.mockReset();
});

describe("recursiveCollapse", () => {
  it("converges even when the LLM never drops a card", async () => {
    // Regression for #136: oversized outputs landed in singleton groups, so the same
    // 52 cards were re-collapsed every round until Convex killed the action at 600s.
    echoCollapse();
    const outputs = ["a", "b", "c", "d", "e", "f", "g", "h"].map((tag) => cards(tag));

    const result = await recursiveCollapse(outputs, makeDeps(540_000));

    // 8 outputs -> 4 pairs -> 2 pairs -> 2 outputs: six calls, then stop.
    expect(invokeCollapse).toHaveBeenCalledTimes(6);
    expect(result).toHaveLength(2);
    expect(result.flat()).toHaveLength(160);
  });

  it("hands outputs on as-is without any LLM call once the collapse budget is spent", async () => {
    const outputs = ["a", "b", "c"].map((tag) => cards(tag));

    const result = await recursiveCollapse(outputs, makeDeps(0));

    expect(result).toEqual(outputs);
    expect(invokeCollapse).not.toHaveBeenCalled();
  });

  it("skips groups that start after the budget has run low instead of firing doomed calls", async () => {
    const clock = fakeClock();
    // The first collapse call uses up most of the budget; groups queued behind it
    // must pass through uncollapsed rather than call the LLM.
    invokeCollapse.mockImplementation(async () => {
      clock.advance(250_000);
      return { flashcards: cards("z", 25) };
    });
    const outputs = ["a", "b", "c", "d", "e", "f"].map((tag) => cards(tag));
    const deps = makeDeps(540_000, clock.now);

    const result = await recursiveCollapse(outputs, deps);

    expect(invokeCollapse).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      cards("z", 25),
      [...outputs[2], ...outputs[3]],
      [...outputs[4], ...outputs[5]],
    ]);
  });

  it("keeps a group's cards when its collapse call fails", async () => {
    invokeCollapse.mockRejectedValue(new Error("invalid JSON"));
    const outputs = ["a", "b", "c"].map((tag) => cards(tag));

    const result = await recursiveCollapse(outputs, makeDeps(540_000));

    expect(result).toEqual([[...outputs[0], ...outputs[1]], outputs[2]]);
  });

  it("never lets a collapse return more cards than it was given", async () => {
    invokeCollapse.mockResolvedValue({ flashcards: cards("z", 90) });
    const outputs = ["a", "b", "c"].map((tag) => cards(tag));

    const result = await recursiveCollapse(outputs, makeDeps(540_000));

    expect(result[0]).toHaveLength(40);
    expect(result[0][0].front).toContain("z0");
  });

  it("keeps a group's cards when the collapse returns no cards", async () => {
    invokeCollapse.mockResolvedValue({ flashcards: [] });
    const outputs = ["a", "b", "c"].map((tag) => cards(tag));

    const result = await recursiveCollapse(outputs, makeDeps(540_000));

    expect(result).toEqual([[...outputs[0], ...outputs[1]], outputs[2]]);
  });

  it("keeps a group's cards when the collapse returns only unusable cards", async () => {
    invokeCollapse.mockResolvedValue({
      flashcards: cards("z", 25).map((card) => ({ ...card, back: "" })),
    });
    const outputs = ["a", "b", "c"].map((tag) => cards(tag));

    const result = await recursiveCollapse(outputs, makeDeps(540_000));

    expect(result).toEqual([[...outputs[0], ...outputs[1]], outputs[2]]);
  });
});
