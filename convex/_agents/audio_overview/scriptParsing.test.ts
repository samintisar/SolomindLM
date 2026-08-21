import { describe, expect, it } from "vitest";
import {
  buildFallbackDialogueScriptFromBeats,
  parseDialogueScriptResponse,
  resolveDialogueScript,
} from "./scriptParsing";

describe("parseDialogueScriptResponse", () => {
  it("parses a valid dialogue JSON array from surrounding text", () => {
    const result = parseDialogueScriptResponse(
      'Here is the script:\n[{"speaker":"host_a","text":"Specific opening."},{"speaker":"host_b","text":"Useful pushback."}]',
      2
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script).toEqual([
        { speaker: "host_a", text: "Specific opening." },
        { speaker: "host_b", text: "Useful pushback." },
      ]);
    }
  });

  it("rejects an unparseable response", () => {
    const result = parseDialogueScriptResponse("I cannot make JSON for this.", 2);

    expect(result).toEqual({
      ok: false,
      reason: "missing_json_array",
    });
  });

  it("rejects scripts that are too short to be a useful overview", () => {
    const result = parseDialogueScriptResponse(
      '[{"speaker":"host_a","text":"Too short."},{"speaker":"host_b","text":"Still too short."}]',
      3
    );

    expect(result).toEqual({
      ok: false,
      reason: "too_short",
      actualLines: 2,
      minimumLines: 3,
    });
  });

  it("rejects entries with invalid speakers or blank text", () => {
    const result = parseDialogueScriptResponse(
      '[{"speaker":"host_c","text":"Wrong speaker."},{"speaker":"host_b","text":"   "}]',
      1
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid_line",
      lineIndex: 0,
    });
  });
});

describe("buildFallbackDialogueScriptFromBeats", () => {
  it("builds a non-generic dialogue from extracted beats", () => {
    const script = buildFallbackDialogueScriptFromBeats(
      [
        "CLAIM: The report says retrieval quality improved by 18% after reranking.",
        "PUSHBACK: The source does not say whether that lift holds for small notebooks.",
        "FOLLOWUP: What happens when the selected sources disagree with each other?",
      ].join("\n"),
      6
    );

    expect(script).toHaveLength(6);
    expect(script.map((line) => line.text).join(" ")).toContain("retrieval quality improved");
    expect(script.map((line) => line.text).join(" ")).not.toContain(
      "I've analyzed the content you provided"
    );
    expect(script[0].speaker).toBe("host_a");
    expect(script[1].speaker).toBe("host_b");
  });

  it("returns null when there are no usable beats", () => {
    expect(buildFallbackDialogueScriptFromBeats(" --- \n\n", 6)).toBeNull();
  });
});

describe("resolveDialogueScript", () => {
  it("parses JSON even when reasoning text contains an earlier bracket", () => {
    const script = resolveDialogueScript(
      '[internal draft]\nHere is the script:\n[{"speaker":"host_a","text":"Routing splits work across specialists."},{"speaker":"host_b","text":"And then you merge the results."}]',
      "",
      8
    );
    expect(script).toHaveLength(2);
    expect(script[0].text).toContain("Routing splits work");
  });

  it("falls back to extracted beats instead of a generic stub", () => {
    const script = resolveDialogueScript(
      "I cannot emit JSON this time.",
      [
        "CLAIM: Retrieval quality improved by 18% after reranking.",
        "PUSHBACK: That lift may not hold for small notebooks.",
      ].join("\n"),
      8
    );
    expect(script.length).toBeGreaterThanOrEqual(8);
    expect(script.map((line) => line.text).join(" ")).toContain("Retrieval quality improved");
    expect(script.map((line) => line.text).join(" ")).not.toContain(
      "I've analyzed the content you provided"
    );
  });

  it("throws when neither JSON nor beats can produce a script", () => {
    expect(() => resolveDialogueScript("no json", " --- \n\n", 8)).toThrow(
      /Dialogue script generation failed/
    );
  });
});
