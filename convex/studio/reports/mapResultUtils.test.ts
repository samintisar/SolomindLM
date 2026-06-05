import { describe, expect, it } from "vitest";
import { isFailedMapResult } from "./mapResultUtils.js";

describe("isFailedMapResult", () => {
  it("returns false for successful map JSON", () => {
    expect(
      isFailedMapResult(
        JSON.stringify({
          topics: ["A"],
          summary: "A long enough summary for the map phase to be considered successful.",
        })
      )
    ).toBe(false);
  });

  it("returns true for explicit error markers", () => {
    expect(isFailedMapResult(JSON.stringify({ _error: true, errorMessage: "timeout" }))).toBe(true);
  });

  it("returns true for corrupt non-JSON strings", () => {
    expect(isFailedMapResult("not valid json {{{")).toBe(true);
  });
});
