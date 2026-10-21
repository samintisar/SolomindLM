import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJobDeadline } from "../_job/jobDeadline";
import { isCutOffReply, reduceMindMap } from "./mindmapJobPhases";

const { invokeTogetherText } = vi.hoisted(() => ({ invokeTogetherText: vi.fn() }));

vi.mock("../../_agents/_shared/studioTextLlm", () => ({ invokeTogetherText }));

const MAP = ["# Markets", "* Supply", "  * Supply curve", "* Demand", "  * Elasticity"].join("\n");
const CUT_OFF = ["# Markets", "* Supply", "  * Supply curve", "* Monopoly", "  * Barriers"].join(
  "\n"
);

const extractions = [
  { main_theme: "Supply", summary: "Supply rises with price.", key_concepts: ["Supply curve"] },
  { main_theme: "Demand", summary: "Demand falls with price.", key_concepts: ["Elasticity"] },
];

/** A reply with the given finish reason. */
function reply(markdown: string, finishReason: string) {
  return async (options: { onFinishReason?: (reason: string) => void }) => {
    options.onFinishReason?.(finishReason);
    return markdown;
  };
}

const run = () =>
  reduceMindMap({
    fullInput: "FULL INPUT",
    extractions,
    deadline: createJobDeadline(540_000),
  });

beforeEach(() => {
  invokeTogetherText.mockReset();
});

describe("reduceMindMap", () => {
  it("returns the map from a complete reply", async () => {
    invokeTogetherText.mockImplementationOnce(reply(MAP, "stop"));

    const { mindMap } = await run();

    expect(mindMap.nodeData.topic).toBe("Markets");
    expect(mindMap.nodeData.children.map((c) => c.topic)).toEqual(["Supply", "Demand"]);
    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
  });

  it("never saves a reply cut off at the output cap; retries on compact input for a smaller map", async () => {
    invokeTogetherText
      .mockImplementationOnce(reply(CUT_OFF, "length"))
      .mockImplementationOnce(reply(MAP, "stop"));

    const { mindMap } = await run();

    expect(mindMap.nodeData.children.map((c) => c.topic)).toEqual(["Supply", "Demand"]);
    const retry = invokeTogetherText.mock.calls[1][0];
    expect(retry.userPrompt).not.toContain("FULL INPUT");
    expect(retry.userPrompt).toContain("THEME: Supply");
    expect(retry.userPrompt).toContain("was cut off");
  });

  it("falls back to the rule-based map when every reply is cut off", async () => {
    invokeTogetherText.mockImplementation(reply(CUT_OFF, "length"));

    const { mindMap } = await run();

    expect(invokeTogetherText).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mindMap)).not.toContain("Barriers");
    expect(JSON.stringify(mindMap)).toContain("Supply curve");
  });

  it("doesn't ask for a smaller map after a failure that wasn't a cut-off", async () => {
    invokeTogetherText
      .mockImplementationOnce(reply("no bullets here", "stop"))
      .mockImplementationOnce(reply(MAP, "stop"));

    await run();

    expect(invokeTogetherText.mock.calls[1][0].userPrompt).not.toContain("was cut off");
  });
});

describe("isCutOffReply", () => {
  it("reads the provider's finish reason, or a reply that used every token", () => {
    expect(isCutOffReply("length", 100, 16_000)).toBe(true);
    expect(isCutOffReply("max_tokens", 100, 16_000)).toBe(true);
    expect(isCutOffReply(undefined, 16_000, 16_000)).toBe(true);
    expect(isCutOffReply("stop", 9_000, 16_000)).toBe(false);
    expect(isCutOffReply(undefined, undefined, 16_000)).toBe(false);
  });
});

describe("reduceMindMap usage-based cut-off and fallback marker", () => {
  it("treats a reply that used the whole budget as cut off even without a finish reason", async () => {
    invokeTogetherText
      .mockImplementationOnce(
        async (options: {
          onUsage?: (u: { prompt: number; completion: number; total: number }) => void;
        }) => {
          options.onUsage?.({ prompt: 1, completion: 16_000, total: 16_001 });
          return CUT_OFF;
        }
      )
      .mockImplementationOnce(reply(MAP, "stop"));

    const { mindMap, fallbackReason } = await run();

    expect(mindMap.nodeData.children.map((c) => c.topic)).toEqual(["Supply", "Demand"]);
    expect(fallbackReason).toBeUndefined();
  });

  it("says why it fell back to the rule-based map", async () => {
    invokeTogetherText.mockImplementation(reply(CUT_OFF, "length"));

    const { fallbackReason } = await run();

    expect(fallbackReason).toBe("Reduce was cut off at the output-token cap");
  });
});
