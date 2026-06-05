import { describe, expect, it } from "vitest";
import { extractJsonObjectString, togetherStructuredJsonPayload } from "./cachedLlm.js";

describe("extractJsonObjectString", () => {
  it("returns bare JSON objects", () => {
    const json = '{"topics":["A"],"summary":"A long enough summary for validation to pass here."}';
    expect(extractJsonObjectString(json)).toBe(json);
  });

  it("extracts JSON from fenced blocks", () => {
    const inner = '{"topics":["B"],"summary":"Another summary that is long enough for the schema."}';
    expect(extractJsonObjectString(`Here is output:\n\`\`\`json\n${inner}\n\`\`\``)).toBe(inner);
  });

  it("ignores reasoning monologue without JSON", () => {
    expect(extractJsonObjectString("Need JSON output only, planning next step...")).toBeNull();
  });
});

describe("togetherStructuredJsonPayload", () => {
  it("prefers content JSON over non-JSON reasoning", () => {
    const json = '{"topics":["C"],"summary":"Summary text that is long enough for validation."}';
    const payload = togetherStructuredJsonPayload({
      message: {
        content: json,
        reasoning: "Need JSON format first...",
      },
    });
    expect(payload).toBe(json);
  });

  it("extracts JSON embedded in reasoning when content is empty", () => {
    const json = '{"topics":["D"],"summary":"Embedded reasoning summary long enough for schema."}';
    const payload = togetherStructuredJsonPayload({
      message: {
        content: "",
        reasoning: `Thinking...\n${json}`,
      },
    });
    expect(payload).toBe(json);
  });

  it("returns empty string when neither field has JSON", () => {
    expect(
      togetherStructuredJsonPayload({
        message: { content: "", reasoning: "Need JSON only" },
      })
    ).toBe("");
  });
});
