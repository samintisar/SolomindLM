import { describe, expect, it } from "vitest";
import { buildFallbackDialogueScriptFromBeats, parseDialogueScriptResponse } from "./scriptParsing";

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
