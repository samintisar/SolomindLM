import { describe, expect, it } from "vitest";
import { CHAT_CONFIG_OVERRIDE_KEYS } from "../../convex/_agents/chat/chatConfigOverrides";
import { parseChatConfigFlag, parseChatConfigValue } from "./chatConfigFlag";

describe("parseChatConfigFlag", () => {
  it("parses several key=value pairs with their types", () => {
    expect(parseChatConfigFlag("hydeEnabled=false,contextTokenBudget=4000")).toEqual({
      hydeEnabled: false,
      contextTokenBudget: 4000,
    });
  });

  it("reads the full-document expansion as on, off or a token cap", () => {
    expect(parseChatConfigFlag("fullDocumentExpansion=off")).toEqual({
      fullDocumentExpansion: "off",
    });
    expect(parseChatConfigFlag("fullDocumentExpansion=on")).toEqual({
      fullDocumentExpansion: "on",
    });
    expect(parseChatConfigFlag("fullDocumentExpansion=6000")).toEqual({
      fullDocumentExpansion: 6000,
    });
  });

  it("reads the few-shot policy as a name", () => {
    expect(parseChatConfigFlag("fewShotPolicy=complex-only")).toEqual({
      fewShotPolicy: "complex-only",
    });
  });

  it("names the allowed keys when a key is unknown", () => {
    expect(() => parseChatConfigFlag("hydeOn=true")).toThrow(/Unknown.*hydeOn/);
    expect(() => parseChatConfigFlag("hydeOn=true")).toThrow(
      new RegExp(CHAT_CONFIG_OVERRIDE_KEYS.join(".*"))
    );
  });

  it("rejects a value of the wrong type", () => {
    expect(() => parseChatConfigFlag("contextTokenBudget=4k")).toThrow(/integer/);
    expect(() => parseChatConfigFlag("hydeEnabled=yes")).toThrow(/true or false/);
    expect(() => parseChatConfigFlag("fewShotPolicy=sometimes")).toThrow(/fewShotPolicy/);
  });

  it("rejects a value outside its range", () => {
    expect(() => parseChatConfigFlag("maxSubqueries=9")).toThrow(/maxSubqueries/);
    expect(() => parseChatConfigFlag("keywordVariants=3")).toThrow(/keywordVariants/);
  });

  it("rejects a repeated key, a pair without =, and an empty pair", () => {
    expect(() => parseChatConfigFlag("hydeEnabled=true,hydeEnabled=false")).toThrow(/twice/);
    expect(() => parseChatConfigFlag("hydeEnabled")).toThrow(/key=value/);
    expect(() => parseChatConfigFlag("hydeEnabled=true,")).toThrow(/key=value/);
  });
});

describe("parseChatConfigValue", () => {
  it("parses one value for a grid axis", () => {
    expect(parseChatConfigValue("rerankEnabled", "false")).toBe(false);
    expect(parseChatConfigValue("contextTokenBudget", "8000")).toBe(8000);
    expect(parseChatConfigValue("fullDocumentExpansion", "on")).toBe("on");
  });
});
