import { describe, expect, it } from "vitest";
import { isAgentStageName } from "./types.agentStage";

describe("isAgentStageName", () => {
  it("accepts known stages and rejects others", () => {
    expect(isAgentStageName("map")).toBe(true);
    expect(isAgentStageName("tts")).toBe(true);
    expect(isAgentStageName("prompt")).toBe(false);
  });
});
