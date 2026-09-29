import { describe, expect, it, vi } from "vitest";
import {
  continueScriptIfNeeded,
  getContinuationMaxTokens,
  planScriptContinuation,
} from "./scriptContinuation";
import type { DialogueLine } from "./state";

const lines = (count: number, wordsPerLine: number): DialogueLine[] =>
  Array.from({ length: count }, (_, i) => ({
    speaker: i % 2 === 0 ? "host_a" : "host_b",
    text: Array.from({ length: wordsPerLine }, (_, w) => `w${i}_${w}`).join(" "),
  }));

describe("planScriptContinuation", () => {
  it("does nothing for a complete script near its word target", () => {
    expect(
      planScriptContinuation({ script: lines(220, 19), targetWords: 4400, cutOff: false })
    ).toBeNull();
  });

  it("extends a complete but short script, replacing its sign-off", () => {
    const plan = planScriptContinuation({
      script: lines(300, 16),
      targetWords: 7000,
      cutOff: false,
    });

    expect(plan).not.toBeNull();
    // Drops the closing exchange so the continuation doesn't follow a goodbye.
    expect(plan?.keepLines).toBe(298);
    // ~2250 missing words at the script's own ~16 words/turn.
    expect(plan?.turns).toBeGreaterThanOrEqual(130);
    expect(plan?.turns).toBeLessThanOrEqual(150);
  });

  it("asks a cut-off script for at least a short wrap-up, keeping every line", () => {
    const plan = planScriptContinuation({
      script: lines(220, 20),
      targetWords: 4400,
      cutOff: true,
    });

    expect(plan).toEqual({ keepLines: 220, turns: expect.any(Number) });
    expect(plan?.turns).toBeGreaterThanOrEqual(2);
    expect(plan?.turns).toBeLessThanOrEqual(6);
  });

  it("caps the continuation so its output fits one call", () => {
    const plan = planScriptContinuation({
      script: lines(20, 16),
      targetWords: 7000,
      cutOff: false,
    });

    expect(plan?.turns).toBeLessThanOrEqual(250);
  });
});

describe("continueScriptIfNeeded", () => {
  const newLines = (texts: string[]) =>
    JSON.stringify(texts.map((text, i) => ({ speaker: i % 2 ? "host_b" : "host_a", text })));

  it("returns the script untouched when no continuation is needed", async () => {
    const script = lines(220, 20);
    const generate = vi.fn();

    const result = await continueScriptIfNeeded({
      script,
      cutOff: false,
      targetWords: 4400,
      canContinue: () => true,
      generate,
    });

    expect(result).toBe(script);
    expect(generate).not.toHaveBeenCalled();
  });

  it("replaces the sign-off with the continuation for a short complete script", async () => {
    const script = lines(100, 20);
    const generate = vi.fn().mockResolvedValue(newLines(["Continuing the point.", "And closing."]));

    const result = await continueScriptIfNeeded({
      script,
      cutOff: false,
      targetWords: 4400,
      canContinue: () => true,
      generate,
    });

    expect(generate).toHaveBeenCalledWith(script.slice(0, 98), expect.any(Number));
    expect(result).toHaveLength(100);
    expect(result.slice(-2).map((l) => l.text)).toEqual(["Continuing the point.", "And closing."]);
  });

  it("drops continuation lines that repeat the script so far", async () => {
    const script = lines(10, 20);
    const generate = vi
      .fn()
      .mockResolvedValue(
        newLines([script[3].text, "A genuinely new closing thought for listeners."])
      );

    const result = await continueScriptIfNeeded({
      script,
      cutOff: true,
      targetWords: 200,
      canContinue: () => true,
      generate,
    });

    expect(result).toHaveLength(11);
    expect(result[10].text).toBe("A genuinely new closing thought for listeners.");
  });

  it("keeps the original script when the continuation fails or is unusable", async () => {
    const script = lines(100, 20);

    for (const generate of [
      vi.fn().mockRejectedValue(new Error("provider down")),
      vi.fn().mockResolvedValue("not json"),
    ]) {
      const result = await continueScriptIfNeeded({
        script,
        cutOff: false,
        targetWords: 4400,
        canContinue: () => true,
        generate,
      });
      expect(result).toBe(script);
    }
  });

  it("skips the continuation when the time budget is spent", async () => {
    const script = lines(100, 20);
    const generate = vi.fn();

    const result = await continueScriptIfNeeded({
      script,
      cutOff: true,
      targetWords: 4400,
      canContinue: () => false,
      generate,
    });

    expect(result).toBe(script);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("continueScriptIfNeeded runaway guard", () => {
  const asJson = (texts: string[]) =>
    JSON.stringify(texts.map((text, i) => ({ speaker: i % 2 ? "host_b" : "host_a", text })));

  it("keeps a runaway continuation's first turns in order, then asks for a wrap-up", async () => {
    const script = lines(100, 20); // 2000 words vs 2400 target -> ~22 turns requested
    const runaway = Array.from(
      { length: 400 },
      (_, i) => `Runaway turn number ${i} with enough words.`
    );
    runaway.push("Final closing line one for the episode.", "Final closing line two, goodbye.");
    const generate = vi
      .fn()
      .mockResolvedValueOnce(asJson(runaway))
      .mockResolvedValueOnce(
        asJson(["That wraps the point up neatly.", "Thanks for listening, everyone."])
      );

    const result = await continueScriptIfNeeded({
      script,
      cutOff: false,
      targetWords: 2400,
      canContinue: () => true,
      generate,
    });

    const requested = generate.mock.calls[0][1] as number;
    const maxLines = Math.ceil(requested * 1.5);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toBe(4);
    // No middle cut: the kept continuation runs straight on from the script so far.
    expect(result.slice(98, 98 + maxLines).map((l) => l.text)).toEqual(runaway.slice(0, maxLines));
    expect(result).toHaveLength(98 + maxLines + 2);
    expect(result.at(-1)?.text).toBe("Thanks for listening, everyone.");
  });

  it("asks for a wrap-up when the continuation itself was cut off", async () => {
    const script = lines(100, 20);
    const truncated = `${asJson(["Picking the thread back up here.", "And pushing on it a bit more."]).slice(0, -1)}, {"speaker": "host_a", "text": "Cut off mid`;
    const generate = vi
      .fn()
      .mockResolvedValueOnce(truncated)
      .mockResolvedValueOnce(asJson(["A proper closing thought for everyone."]));

    const result = await continueScriptIfNeeded({
      script,
      cutOff: true,
      targetWords: 2000,
      canContinue: () => true,
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(103);
    expect(result.at(-1)?.text).toBe("A proper closing thought for everyone.");
  });
});

describe("getContinuationMaxTokens", () => {
  it("scales with the requested turns and never exceeds the limit", () => {
    expect(getContinuationMaxTokens(4, 16_384)).toBeLessThan(1_000);
    expect(getContinuationMaxTokens(100, 16_384)).toBeGreaterThan(
      getContinuationMaxTokens(4, 16_384)
    );
    expect(getContinuationMaxTokens(250, 16_384)).toBe(16_384);
  });
});

describe("planScriptContinuation with unspaced languages", () => {
  it("does not treat a full-length Japanese script as short", () => {
    // ~40 characters per turn is about 20 words of speech.
    const japanese: DialogueLine[] = Array.from({ length: 100 }, (_, i) => ({
      speaker: i % 2 === 0 ? "host_a" : "host_b",
      text: "日本語の対話です".repeat(5),
    }));

    expect(
      planScriptContinuation({ script: japanese, targetWords: 2000, cutOff: false })
    ).toBeNull();
  });
});
