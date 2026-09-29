import { describe, expect, it } from "vitest";
import { getContinuationPrompt, getMapPrompt, getReducePrompt } from "./prompts";

const baseParams = {
  content: "BEATS",
  audioType: "deep_dive" as const,
  length: "default" as const,
  focus: "general overview",
  targetLines: 220,
};

describe("getReducePrompt", () => {
  it("substitutes every placeholder occurrence, not just the first", () => {
    const prompt = getReducePrompt(baseParams);

    expect(prompt).not.toMatch(
      /\{(targetLines|estimatedWords|content|audioType|focus|coveredTopicsPrompt)\}/
    );
    // targetLines is referenced throughout the length instructions.
    expect(prompt.match(/\b220\b/g)?.length ?? 0).toBeGreaterThan(3);
  });

  it("inserts source content verbatim even when it contains $-replacement patterns", () => {
    const content = "Price rose from $5 to $& then $' and $` in the source.";

    const prompt = getReducePrompt({ ...baseParams, content });

    expect(prompt).toContain(content);
  });
});

describe("getMapPrompt", () => {
  it("inserts chunk text verbatim even when it contains $-replacement patterns", () => {
    const chunk = "Let $x$ be real; then $&x$ and $'y$ hold.";

    expect(getMapPrompt("deep_dive", chunk)).toContain(chunk);
  });
});

describe("getContinuationPrompt", () => {
  it("includes the beats, the script so far and the turn budget with no unfilled placeholders", () => {
    const prompt = getContinuationPrompt({
      content: "BEATS",
      scriptSoFar: [{ speaker: "host_a", text: "Last line so far." }],
      turns: 42,
      audioType: "deep_dive",
      focus: "general overview",
    });

    expect(prompt).toContain("BEATS");
    expect(prompt).toContain("Last line so far.");
    expect(prompt).toMatch(/\b42\b/);
    expect(prompt).not.toMatch(/\{(content|scriptSoFar|turns|audioType|focus)\}/);
  });
});
